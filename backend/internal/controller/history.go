package controller

import (
	"context"
	"net/http"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
)

// HistEvent is one line of a workflow's event history, trimmed for the stage.
type HistEvent struct {
	ID     int64  `json:"id"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	Worker int    `json:"worker"`
	T      int64  `json:"t"`
}

// histKind classifies a history event. Workflow-task scheduled/started/completed
// (and anything else not worth showing) report keep=false.
func histKind(ev *historypb.HistoryEvent) (kind, label string, keep bool) {
	switch ev.GetEventType() {
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
		return "started", ev.GetWorkflowExecutionStartedEventAttributes().GetWorkflowType().GetName(), true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
		return "scheduled", ev.GetActivityTaskScheduledEventAttributes().GetActivityType().GetName(), true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED:
		return "activityStarted", "", true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
		return "completed", "", true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_FAILED:
		return "failed", "", true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
		return "timedOut", "", true
	case enumspb.EVENT_TYPE_TIMER_STARTED:
		return "timerStarted", "", true
	case enumspb.EVENT_TYPE_TIMER_FIRED:
		return "timerFired", "", true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED:
		return "signaled", ev.GetWorkflowExecutionSignaledEventAttributes().GetSignalName(), true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_ACCEPTED:
		return "update", ev.GetWorkflowExecutionUpdateAcceptedEventAttributes().GetAcceptedRequest().GetInput().GetName(), true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CANCEL_REQUESTED:
		return "cancelRequested", "", true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
		return "canceled", "", true
	case enumspb.EVENT_TYPE_WORKFLOW_TASK_FAILED:
		return "wfTaskFailed", "", true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
		enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
		enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT,
		enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED:
		return "closed", "", true
	}
	return "", "", false
}

// histIdentity is the worker or client identity an event carries, if any.
func histIdentity(ev *historypb.HistoryEvent) string {
	switch ev.GetEventType() {
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED:
		return ev.GetActivityTaskStartedEventAttributes().GetIdentity()
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
		return ev.GetActivityTaskCompletedEventAttributes().GetIdentity()
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_FAILED:
		return ev.GetActivityTaskFailedEventAttributes().GetIdentity()
	case enumspb.EVENT_TYPE_WORKFLOW_TASK_FAILED:
		return ev.GetWorkflowTaskFailedEventAttributes().GetIdentity()
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED:
		return ev.GetWorkflowExecutionSignaledEventAttributes().GetIdentity()
	}
	return ""
}

// history reads one workflow's events from Temporal.
func (c *Controller) history(ctx context.Context, id string) ([]HistEvent, error) {
	it := c.tc.GetWorkflowHistory(ctx, id, "", false, enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)
	out := []HistEvent{}
	activity := map[int64]string{} // scheduled event id -> activity type
	for it.HasNext() {
		ev, err := it.Next()
		if err != nil {
			return nil, err
		}
		kind, label, keep := histKind(ev)
		if ev.GetEventType() == enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED {
			activity[ev.GetEventId()] = label
		}
		if !keep {
			continue
		}
		switch ev.GetEventType() {
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED:
			label = activity[ev.GetActivityTaskStartedEventAttributes().GetScheduledEventId()]
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
			label = activity[ev.GetActivityTaskCompletedEventAttributes().GetScheduledEventId()]
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_FAILED:
			label = activity[ev.GetActivityTaskFailedEventAttributes().GetScheduledEventId()]
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
			label = activity[ev.GetActivityTaskTimedOutEventAttributes().GetScheduledEventId()]
		}
		out = append(out, HistEvent{
			ID:     ev.GetEventId(),
			Kind:   kind,
			Label:  label,
			Worker: workerIDFromIdentity(histIdentity(ev)),
			T:      ev.GetEventTime().AsTime().UnixMilli(),
		})
	}
	return out, nil
}

func (c *Controller) handleHistory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	evs, err := c.history(ctx, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, evs)
}
