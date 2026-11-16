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

const pollerFresh = 5 * time.Second

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

// queueFromInfo folds a DescribeTaskQueueEnhanced answer into a QueueView.
func queueFromInfo(desc client.TaskQueueDescription, now time.Time) QueueView {
	seen := map[int]bool{}
	var backlog int64
	for _, vi := range desc.VersionsInfo {
		for _, ti := range vi.TypesInfo {
			if ti.Stats != nil {
				backlog += ti.Stats.ApproximateBacklogCount
			}
			for _, p := range ti.Pollers {
				if now.Sub(p.LastAccessTime) >= pollerFresh {
					continue
				}
				if id := workerIDFromIdentity(p.Identity); id > 0 {
					seen[id] = true
				}
			}
		}
	}
	q := QueueView{Pollers: []int{}, Backlog: backlog}
	for id := range seen {
		q.Pollers = append(q.Pollers, id)
	}
	sort.Ints(q.Pollers)
	return q
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
		for _, id := range ids {
			c.describeOne(ctx, id)
		}
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
		live, up := c.step.Live, c.temporalUp
		c.mu.Unlock()
		if !live || !up {
			continue
		}
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
		q := queueFromInfo(desc, time.Now())
		c.mu.Lock()
		c.queue = q
		c.mu.Unlock()
	}
}
