package controller

import (
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// workerProc is one real worker, running in its own Docker container
// (worker-biscuit, worker-mochi, …) so the audience can watch it die in Docker Desktop.
type workerProc struct {
	id        int
	up        bool
	gen       int // bumps on every start/kill so stale callbacks can tell
	downUntil time.Time
	completed int
	frozen    bool // docker pause in progress; downUntil is when it ends

	replayedAt     int64
	replayedEvents int64
}

func containerOf(id int) string { return orders.ContainerName(id) }

// startWorker runs `docker start` on the worker's container.
func (c *Controller) startWorker(id int) {
	if err := docker("start", containerOf(id)); err != nil {
		log.Printf("start %s (run `make up` to create the worker containers): %v", containerOf(id), err)
		return
	}
	c.mu.Lock()
	w := c.workers[id]
	w.gen++
	w.up, w.downUntil = true, time.Time{}
	c.mu.Unlock()
}

// killWorker runs `docker kill` (SIGKILL) on the worker's container.
// With downFor > 0 it is started again after that long.
func (c *Controller) killWorker(id int, downFor time.Duration) bool {
	c.mu.Lock()
	w := c.workers[id]
	if !w.up {
		c.mu.Unlock()
		return false
	}
	wasFrozen := w.frozen
	w.frozen = false
	w.up = false
	w.gen++
	gen := w.gen
	if downFor > 0 {
		w.downUntil = time.Now().Add(downFor)
		c.markInterrupted(id)
	}
	c.mu.Unlock()

	if wasFrozen {
		_ = docker("unpause", containerOf(id)) // a paused container cannot be killed
	}
	if err := docker("kill", containerOf(id)); err != nil {
		log.Printf("kill %s: %v", containerOf(id), err)
	}

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

// freezeWorker runs `docker pause` on the worker's container and `docker unpause`
// after HammerDuration. The process stays alive but gets no CPU, so its heartbeats stop.
func (c *Controller) freezeWorker(id int) bool {
	if id < 1 || id > numWorkers {
		return false
	}
	c.mu.Lock()
	w := c.workers[id]
	if !w.up || w.frozen {
		c.mu.Unlock()
		return false
	}
	until := time.Now().Add(HammerDuration)
	w.frozen, w.downUntil = true, until
	c.say("docker pause %s: %s is frozen for 10 s. The process is alive but silent.", containerOf(id), orders.WorkerName(id))
	c.mu.Unlock()

	if err := docker("pause", containerOf(id)); err != nil {
		log.Printf("pause %s: %v", containerOf(id), err)
	}
	time.AfterFunc(HammerDuration, func() {
		c.mu.Lock()
		stale := !w.frozen || !w.downUntil.Equal(until) // thawed by a step change or killed meanwhile
		if !stale {
			w.frozen, w.downUntil = false, time.Time{}
		}
		c.mu.Unlock()
		if !stale {
			if err := docker("unpause", containerOf(id)); err != nil {
				log.Printf("unpause %s: %v", containerOf(id), err)
			}
		}
	})
	return true
}

// takeFrozen clears the frozen flag of every worker and returns their ids.
func (c *Controller) takeFrozen() []int {
	c.mu.Lock()
	defer c.mu.Unlock()
	var ids []int
	for i := 1; i <= numWorkers; i++ {
		if w := c.workers[i]; w.frozen {
			w.frozen, w.downUntil = false, time.Time{}
			ids = append(ids, i)
		}
	}
	return ids
}

// unpauseAll unfreezes every frozen worker, so a restart never meets a paused container.
func (c *Controller) unpauseAll() {
	for _, id := range c.takeFrozen() {
		if err := docker("unpause", containerOf(id)); err != nil {
			log.Printf("unpause %s: %v", containerOf(id), err)
		}
	}
}

// restartAllWorkers gives every worker a fresh process (empty workflow cache)
// when a step starts. The four containers restart in parallel.
func (c *Controller) restartAllWorkers() {
	var wg sync.WaitGroup
	for i := 1; i <= numWorkers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			c.mu.Lock()
			w := c.workers[id]
			w.gen++
			w.up = false
			c.mu.Unlock()
			if err := docker("restart", "--time", "0", containerOf(id)); err != nil {
				log.Printf("restart %s: %v", containerOf(id), err)
				return
			}
			c.mu.Lock()
			w.gen++
			w.up, w.downUntil = true, time.Time{}
			c.mu.Unlock()
		}(i)
	}
	wg.Wait()
}

// dockerWatchLoop keeps worker state in sync with Docker, so stopping or
// starting a worker from Docker Desktop shows up on the board too.
func (c *Controller) dockerWatchLoop(stop <-chan struct{}) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	names := make([]string, 0, numWorkers)
	for i := 1; i <= numWorkers; i++ {
		names = append(names, containerOf(i))
	}
	for {
		select {
		case <-stop:
			return
		case <-t.C:
		}
		args := append([]string{"inspect", "-f", "{{.Name}} {{.State.Running}}"}, names...)
		out, _ := exec.Command("docker", args...).Output()
		running := map[string]bool{}
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			f := strings.Fields(line)
			if len(f) == 2 {
				running[strings.TrimPrefix(f[0], "/")] = f[1] == "true"
			}
		}
		c.mu.Lock()
		for i := 1; i <= numWorkers; i++ {
			w := c.workers[i]
			r, known := running[containerOf(i)]
			if !known {
				continue
			}
			switch {
			case w.up && !r: // stopped outside the controller (Docker Desktop, crash)
				w.up = false
				w.gen++
				c.markInterrupted(i)
				c.say("%s (%s) stopped outside the simulator.", orders.WorkerName(i), containerOf(i))
			case !w.up && r && !c.restarting(i): // started from Docker Desktop, or restart finished
				w.up = true
				w.gen++
				w.downUntil = time.Time{}
			}
		}
		c.mu.Unlock()
	}
}

// restarting reports whether a hammer or restart for this worker is in progress. Caller holds mu.
func (c *Controller) restarting(id int) bool {
	return time.Now().Before(c.workers[id].downUntil)
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
