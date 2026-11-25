package orders

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReplayWatchSilentWhenNotReplaying(t *testing.T) {
	old := ReplayHook
	t.Cleanup(func() { ReplayHook = old })
	calls := 0
	ReplayHook = func(string, int64) { calls++ }
	env := newEnv(t)
	env.ExecuteWorkflow(OrderWorkflow, testInput())
	require.NoError(t, env.GetWorkflowError())
	require.Zero(t, calls)
}
