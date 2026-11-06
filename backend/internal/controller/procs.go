package controller

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strconv"
	"syscall"
	"time"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// workerProc is one real worker OS process.
type workerProc struct {
	id        int
	cmd       *exec.Cmd
	up        bool
	gen       int // bumps on every start/kill so stale callbacks can tell
	downUntil time.Time
	completed int
}

// startWorker spawns `sim worker --id N`.
func (c *Controller) startWorker(id int) {
	cmd := exec.Command(c.cfg.Exe, "worker",
		"--id", strconv.Itoa(id),
		"--temporal", c.cfg.TemporalHostPort,
		"--controller", c.selfURL)
	out := prefixWriter(fmt.Sprintf("[worker-%d] ", id))
	cmd.Stdout, cmd.Stderr = out, out
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		log.Printf("start worker %d: %v", id, err)
		return
	}

	c.mu.Lock()
	w := c.workers[id]
	w.gen++
	gen := w.gen
	w.cmd, w.up, w.downUntil = cmd, true, time.Time{}
	c.mu.Unlock()

	go func() {
		_ = cmd.Wait()
		c.mu.Lock()
		if w.gen == gen && w.up { // exited on its own
			w.up = false
			c.markInterrupted(id)
			log.Printf("worker %d exited", id)
		}
		c.mu.Unlock()
	}()
}

// killWorker SIGKILLs a worker. With downFor > 0 it comes back after that long.
func (c *Controller) killWorker(id int, downFor time.Duration) bool {
	c.mu.Lock()
	w := c.workers[id]
	if !w.up || w.cmd == nil {
		c.mu.Unlock()
		return false
	}
	cmd := w.cmd
	w.up = false
	w.cmd = nil
	w.gen++
	gen := w.gen
	if downFor > 0 {
		w.downUntil = time.Now().Add(downFor)
		c.markInterrupted(id)
	}
	c.mu.Unlock()

	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)

	if downFor > 0 {
		time.AfterFunc(downFor, func() {
			c.mu.Lock()
			stale := w.gen != gen || w.up
			c.mu.Unlock()
			if !stale {
				c.startWorker(id)
			}
		})
	}
	return true
}

// markInterrupted flags orders whose activity was running on a dead worker.
// Temporal will notice through the heartbeat timeout and retry elsewhere.
// Caller holds mu.
func (c *Controller) markInterrupted(id int) {
	for _, o := range c.order {
		if o.Status == osRunning && o.Worker == id {
			o.Status = osInterrupted
			st := &o.Steps[o.Current]
			st.State = stInterrupted
			st.NextRetryAt = unixMs(time.Now().Add(time.Duration(c.step.HeartbeatMs)*time.Millisecond + c.step.Retry.Backoff(st.Attempt)))
		}
	}
}

func (c *Controller) stopAllWorkers() {
	for i := 1; i <= numWorkers; i++ {
		c.killWorker(i, 0)
	}
}

// interruptedOrder returns the order a crashed worker was running. Caller holds mu.
func (c *Controller) interruptedOrder(id int) *Order {
	for _, o := range c.order {
		if o.Status == osInterrupted && o.Worker == id {
			return o
		}
	}
	return nil
}

func stepName(i int) string {
	if i >= 0 && i < len(orders.StepNames) {
		return orders.StepNames[i]
	}
	return "?"
}

// prefixWriter tags each line of a child's output.
func prefixWriter(prefix string) io.Writer {
	pr, pw := io.Pipe()
	go func() {
		sc := bufio.NewScanner(pr)
		for sc.Scan() {
			log.Print(prefix + sc.Text())
		}
	}()
	return pw
}
