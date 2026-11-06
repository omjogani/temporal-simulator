package orders

import (
	"context"
	"net/http"
	"os"
	"time"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/omjogani/temporal-simulator/backend/internal/tclient"
)

// RunWorker connects to Temporal (waiting for it if needed) and runs one worker
// until the process is killed. Each worker executes one activity at a time so the
// UI can show exactly one order per worker card.
func RunWorker(id int, hostPort, controllerURL string) error {
	identity := ContainerName(id)
	c, err := tclient.DialWithRetry(context.Background(), hostPort, identity)
	if err != nil {
		return err
	}
	defer c.Close()

	w := worker.New(c, TaskQueue, worker.Options{
		Identity:                           identity,
		MaxConcurrentActivityExecutionSize: 1,
		// A killed worker's cached workflows move to the shared queue quickly.
		StickyScheduleToStartTimeout: 2 * time.Second,
	})
	w.RegisterWorkflowWithOptions(OrderWorkflow, workflow.RegisterOptions{Name: WorkflowName})
	w.RegisterActivity(&Activities{
		WorkerID:      id,
		ControllerURL: controllerURL,
		HTTP:          &http.Client{Timeout: 30 * time.Second},
	})
	return w.Run(stopCh())
}

// stopCh closes on SIGINT/SIGTERM or when the controller (our parent) dies,
// so a crashed controller never leaves orphan workers behind.
func stopCh() <-chan any {
	ch := make(chan any)
	parent := os.Getppid()
	go func() {
		intr := worker.InterruptCh()
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-intr:
				close(ch)
				return
			case <-t.C:
				if os.Getppid() != parent {
					close(ch)
					return
				}
			}
		}
	}()
	return ch
}
