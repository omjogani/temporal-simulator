package orders

import "go.temporal.io/sdk/workflow"

// ReplayHook reports a real replay (workflow ID, history events replayed). RunWorker
// sets it to post a "replayed" event to the controller; nil means do nothing.
var ReplayHook func(workflowID string, events int64)

// replayWatch is a demo side channel, outside workflow logic: it produces no workflow
// commands and never influences decisions. It notices when this execution started in
// replay (a worker rebuilt it from history) and reports once when replay ends.
type replayWatch struct {
	startedReplaying bool
	reported         bool
}

func newReplayWatch(ctx workflow.Context) *replayWatch {
	return &replayWatch{startedReplaying: workflow.IsReplaying(ctx)}
}

// check is called after every awaited step.
func (r *replayWatch) check(ctx workflow.Context) {
	if !r.startedReplaying || r.reported || workflow.IsReplaying(ctx) {
		return
	}
	r.reported = true
	if ReplayHook != nil {
		info := workflow.GetInfo(ctx)
		ReplayHook(info.WorkflowExecution.ID, int64(info.GetCurrentHistoryLength()))
	}
}
