package controller

import (
	"context"
	"sort"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// QueueView is the task queue as Temporal reports it: which workers are polling and
// how many tasks wait for one.
type QueueView struct {
	Pollers []int `json:"pollers"`
	Backlog int64 `json:"backlog"`
}

const pollerFresh = 70 * time.Second

// timeoutLabel names the timeout that failed an activity attempt.
func timeoutLabel(t enumspb.TimeoutType) string {
	switch t {
	case enumspb.TIMEOUT_TYPE_START_TO_CLOSE:
		return "start-to-close"
	case enumspb.TIMEOUT_TYPE_HEARTBEAT:
		return "heartbeat"
	case enumspb.TIMEOUT_TYPE_SCHEDULE_TO_CLOSE:
		return "schedule-to-close"
	}
	return ""
}

// workerIDFromIdentity maps a Temporal identity ("worker-mochi") to a worker id; 0 if it is not a worker.
func workerIDFromIdentity(identity string) int {
	for i := 1; i <= numWorkers; i++ {
		if identity == containerOf(i) {
			return i
		}
	}
	return 0
}

// stuckFromEvents reads the newest events (newest first) and reports "nondeterminism"
// when the latest failed workflow task failed for that cause.
func stuckFromEvents(events []*historypb.HistoryEvent) string {
	for _, ev := range events {
		if ev.GetEventType() == enumspb.EVENT_TYPE_WORKFLOW_TASK_FAILED {
			if ev.GetWorkflowTaskFailedEventAttributes().GetCause() == enumspb.WORKFLOW_TASK_FAILED_CAUSE_NON_DETERMINISTIC_ERROR {
				return "nondeterminism"
			}
			return ""
		}
	}
	return ""
}

// listedPollers folds a DescribeTaskQueueEnhanced answer into the newest LastAccessTime
// per worker id, plus the summed backlog.
func listedPollers(desc client.TaskQueueDescription) (map[int]time.Time, int64) {
	listed := map[int]time.Time{}
	var backlog int64
	for _, vi := range desc.VersionsInfo {
		for _, ti := range vi.TypesInfo {
			if ti.Stats != nil {
				backlog += ti.Stats.ApproximateBacklogCount
			}
			for _, p := range ti.Pollers {
				if id := workerIDFromIdentity(p.Identity); id > 0 && p.LastAccessTime.After(listed[id]) {
					listed[id] = p.LastAccessTime
				}
			}
		}
	}
	return listed, backlog
}

// visiblePollers returns the worker ids to show as polling: Temporal lists the worker with a
// LastAccessTime under pollerFresh (above the ~60 s long-poll timeout, since an idle poller's
// time is when its current long poll began), and the controller sees it up and not frozen.
func visiblePollers(listed map[int]time.Time, now time.Time, up, frozen [numWorkers + 1]bool) []int {
	out := []int{}
	for id, at := range listed {
		if id < 1 || id > numWorkers || !up[id] || frozen[id] || now.Sub(at) >= pollerFresh {
			continue
		}
		out = append(out, id)
	}
	sort.Ints(out)
	return out
}

// describeLoop reads, for each open order in the timeout and deploy scenes, what
// Temporal knows that the progress memo does not: the last timeout type and a stuck workflow task.
func (c *Controller) describeLoop(ctx context.Context) {
	t := time.NewTicker(800 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		c.mu.Lock()
		stepID, up := c.step.ID, c.temporalUp
		var ids []string
		if (stepID == 105 || stepID == 106) && up {
			for _, o := range c.order {
				if !o.terminal() {
					ids = append(ids, o.ID)
				}
			}
		}
		c.mu.Unlock()
		if len(ids) > 40 {
			ids = ids[:40]
		}
		tick, cancel := context.WithTimeout(ctx, 1500*time.Millisecond) // a mid-tick Temporal death cannot stall the loop
		for _, id := range ids {
			if tick.Err() != nil {
				break
			}
			c.describeOne(tick, id)
		}
		cancel()
	}
}

func (c *Controller) describeOne(ctx context.Context, id string) {
	dctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	d, err := c.tc.DescribeWorkflowExecution(dctx, id, "")
	if err != nil {
		return
	}
	timeout := ""
	if pa := d.GetPendingActivities(); len(pa) > 0 {
		timeout = timeoutLabel(pa[0].GetLastFailure().GetTimeoutFailureInfo().GetTimeoutType())
	}
	var stuck *string // nil: leave as is (history fetch failed)
	if attempt := d.GetPendingWorkflowTask().GetAttempt(); attempt > 1 {
		resp, err := c.tc.WorkflowService().GetWorkflowExecutionHistoryReverse(dctx, &workflowservice.GetWorkflowExecutionHistoryReverseRequest{
			Namespace:       client.DefaultNamespace,
			Execution:       d.GetWorkflowExecutionInfo().GetExecution(),
			MaximumPageSize: 10,
		})
		if err == nil {
			s := stuckFromEvents(resp.GetHistory().GetEvents())
			stuck = &s
		}
	} else {
		empty := ""
		stuck = &empty
	}
	c.mu.Lock()
	if o := c.orders[id]; o != nil {
		o.Timeout = timeout
		if stuck != nil {
			o.Stuck = *stuck
		}
	}
	c.mu.Unlock()
}

// queueLoop polls the task queue for pollers and backlog on every live step.
func (c *Controller) queueLoop(ctx context.Context) {
	t := time.NewTicker(700 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		c.mu.Lock()
		live, tUp := c.step.Live, c.temporalUp
		if !live || !tUp {
			c.queue = QueueView{Pollers: []int{}} // no stale pollers on a dead server
			c.mu.Unlock()
			continue
		}
		c.mu.Unlock()
		qctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		desc, err := c.tc.DescribeTaskQueueEnhanced(qctx, client.DescribeTaskQueueEnhancedOptions{
			TaskQueue:     orders.TaskQueue,
			ReportPollers: true,
			ReportStats:   true,
		})
		cancel()
		if err != nil {
			continue
		}
		listed, backlog := listedPollers(desc)
		c.mu.Lock()
		var up, frozen [numWorkers + 1]bool
		for i := 1; i <= numWorkers; i++ {
			up[i], frozen[i] = c.workers[i].up, c.workers[i].frozen
		}
		c.queue = QueueView{Pollers: visiblePollers(listed, time.Now(), up, frozen), Backlog: backlog}
		c.mu.Unlock()
	}
}
