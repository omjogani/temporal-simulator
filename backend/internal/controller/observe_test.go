package controller

import (
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
)

func TestTimeoutLabel(t *testing.T) {
	cases := map[enumspb.TimeoutType]string{
		enumspb.TIMEOUT_TYPE_START_TO_CLOSE:    "start-to-close",
		enumspb.TIMEOUT_TYPE_HEARTBEAT:         "heartbeat",
		enumspb.TIMEOUT_TYPE_SCHEDULE_TO_CLOSE: "schedule-to-close",
	}
	for in, want := range cases {
		if got := timeoutLabel(in); got != want {
			t.Errorf("timeoutLabel(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestWorkerIDFromIdentity(t *testing.T) {
	if got := workerIDFromIdentity("worker-mochi"); got != 2 {
		t.Errorf("worker-mochi = %d, want 2", got)
	}
	if got := workerIDFromIdentity("controller"); got != 0 {
		t.Errorf("controller = %d, want 0", got)
	}
}

func TestHistKind(t *testing.T) {
	sched := &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
		Attributes: &historypb.HistoryEvent_ActivityTaskScheduledEventAttributes{
			ActivityTaskScheduledEventAttributes: &historypb.ActivityTaskScheduledEventAttributes{
				ActivityType: &commonpb.ActivityType{Name: "ChargeCard"},
			},
		},
	}
	if k, l, keep := histKind(sched); k != "scheduled" || l != "ChargeCard" || !keep {
		t.Errorf("scheduled: got %q %q %v", k, l, keep)
	}
	fired := &historypb.HistoryEvent{EventType: enumspb.EVENT_TYPE_TIMER_FIRED}
	if k, _, keep := histKind(fired); k != "timerFired" || !keep {
		t.Errorf("timerFired: got %q %v", k, keep)
	}
	wtc := &historypb.HistoryEvent{EventType: enumspb.EVENT_TYPE_WORKFLOW_TASK_COMPLETED}
	if _, _, keep := histKind(wtc); keep {
		t.Error("WorkflowTaskCompleted should be dropped")
	}
}

func TestStuckFromEvents(t *testing.T) {
	nd := &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_WORKFLOW_TASK_FAILED,
		Attributes: &historypb.HistoryEvent_WorkflowTaskFailedEventAttributes{
			WorkflowTaskFailedEventAttributes: &historypb.WorkflowTaskFailedEventAttributes{Cause: enumspb.WORKFLOW_TASK_FAILED_CAUSE_NON_DETERMINISTIC_ERROR},
		},
	}
	if got := stuckFromEvents([]*historypb.HistoryEvent{{EventType: enumspb.EVENT_TYPE_WORKFLOW_TASK_SCHEDULED}, nd}); got != "nondeterminism" {
		t.Errorf("got %q", got)
	}
	if got := stuckFromEvents(nil); got != "" {
		t.Errorf("got %q", got)
	}
}

func TestThawFrozen(t *testing.T) {
	c, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	c.workers[2].frozen = true
	c.workers[4].frozen = true
	ids := c.takeFrozen()
	if len(ids) != 2 || ids[0] != 2 || ids[1] != 4 {
		t.Fatalf("takeFrozen = %v, want [2 4]", ids)
	}
	if c.workers[2].frozen || c.workers[4].frozen {
		t.Fatal("frozen flags not cleared")
	}
	if got := c.takeFrozen(); len(got) != 0 {
		t.Fatalf("second takeFrozen = %v, want none", got)
	}
}

func TestVisiblePollers(t *testing.T) {
	now := time.Now()
	up := [5]bool{false, true, true, false, true}
	frozen := [5]bool{false, false, false, false, true}
	listed := map[int]time.Time{
		1: now.Add(-40 * time.Second), // up, idle long poll: shown
		2: now.Add(-75 * time.Second), // too old: hidden
		3: now.Add(-1 * time.Second),  // down: hidden
		4: now.Add(-1 * time.Second),  // frozen: hidden
	}
	got := visiblePollers(listed, now, up, frozen)
	if len(got) != 1 || got[0] != 1 {
		t.Fatalf("visiblePollers = %v, want [1]", got)
	}
	if got := visiblePollers(nil, now, up, frozen); got == nil || len(got) != 0 {
		t.Fatalf("empty = %#v, want non-nil empty", got)
	}
}
