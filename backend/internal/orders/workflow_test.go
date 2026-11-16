package orders

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

func testInput() OrderInput {
	return OrderInput{OrderID: "o-1", Num: 1, StartToCloseMs: 5000, HeartbeatMs: 1000,
		Retry: RetrySpec{InitialMs: 100, Coefficient: 2, MaxMs: 1000, MaxAttempts: 3}}
}

// newEnv mocks every activity to succeed except the ones named in custom,
// which the test mocks itself.
func newEnv(t *testing.T, custom ...string) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	a := &Activities{}
	env.RegisterActivity(a)
	skip := map[string]bool{}
	for _, n := range custom {
		skip[n] = true
	}
	for _, n := range []string{"ReserveStock", "ChargeCard", "ShipOrder", "ShipExpress", "SendEmail", "ReleaseStock"} {
		if skip[n] {
			continue
		}
		env.OnActivity(n, mock.Anything, mock.Anything).Return(StepResult{Worker: 1}, nil).Maybe()
	}
	return env
}

func queryProgress(t *testing.T, env *testsuite.TestWorkflowEnvironment) Progress {
	t.Helper()
	v, err := env.QueryWorkflow(QueryProgress)
	require.NoError(t, err)
	var p Progress
	require.NoError(t, v.Get(&p))
	return p
}

func TestGiftWrapSignal(t *testing.T) {
	env := newEnv(t)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow(SignalGiftWrap, nil) }, 0)
	env.ExecuteWorkflow(OrderWorkflow, testInput())
	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	require.True(t, queryProgress(t, env).GiftWrap)
}

func TestChangeAddressAcceptedBeforeShip(t *testing.T) {
	env := newEnv(t)
	var got any
	var gotErr error
	env.RegisterDelayedCallback(func() {
		env.UpdateWorkflow(UpdateChangeAddress, "u1", &testsuite.TestUpdateCallback{
			OnReject:   func(err error) { gotErr = err },
			OnComplete: func(v any, err error) { got, gotErr = v, err },
		}, "221B")
	}, 0)
	env.ExecuteWorkflow(OrderWorkflow, testInput())
	require.NoError(t, gotErr)
	require.Equal(t, "address changed to 221B", got)
	require.Equal(t, "221B", queryProgress(t, env).Address)
}

func TestChangeAddressRejectedAfterShip(t *testing.T) {
	env := newEnv(t, "SendEmail")
	env.OnActivity("SendEmail", mock.Anything, mock.Anything).After(5*time.Second).Return(StepResult{Worker: 1}, nil)
	var rejected error
	env.RegisterDelayedCallback(func() {
		env.UpdateWorkflow(UpdateChangeAddress, "u2", &testsuite.TestUpdateCallback{
			OnReject:   func(err error) { rejected = err },
			OnComplete: func(any, error) {},
		}, "221B")
	}, time.Second)
	env.ExecuteWorkflow(OrderWorkflow, testInput())
	require.Error(t, rejected)
	require.Contains(t, rejected.Error(), ErrAlreadyShipped)
}

func TestCancelRunsCleanup(t *testing.T) {
	env := newEnv(t, "ReleaseStock")
	env.OnActivity("ReleaseStock", mock.Anything, mock.Anything).Return(StepResult{Worker: 1}, nil).Once()
	in := testInput()
	in.CourierWaitMs = 10000
	env.RegisterDelayedCallback(func() { env.CancelWorkflow() }, time.Second)
	env.ExecuteWorkflow(OrderWorkflow, in)
	require.True(t, env.IsWorkflowCompleted())
	require.True(t, temporal.IsCanceledError(env.GetWorkflowError()), "got %v", env.GetWorkflowError())
	require.True(t, queryProgress(t, env).Canceled)
	env.AssertExpectations(t)
}

func TestScheduleToCloseGivesUp(t *testing.T) {
	env := newEnv(t, "ReserveStock")
	env.OnActivity("ReserveStock", mock.Anything, mock.Anything).Return(StepResult{}, temporal.NewTimeoutError(enumspb.TIMEOUT_TYPE_SCHEDULE_TO_CLOSE, nil))
	in := testInput()
	in.ScheduleToCloseMs = 1000
	in.Retry.MaxAttempts = 1
	env.ExecuteWorkflow(OrderWorkflow, in)
	require.Error(t, env.GetWorkflowError())
	require.Equal(t, "ScheduleToClose", queryProgress(t, env).GaveUp)
}

func TestLateGoodBuildShipsExpress(t *testing.T) {
	old := Build
	t.Cleanup(func() { Build = old })
	Build = "good"
	env := newEnv(t, "ShipExpress", "ShipOrder") // ShipOrder left unmocked: calling it fails the test
	env.OnActivity("ShipExpress", mock.Anything, mock.Anything).Return(StepResult{Worker: 1}, nil).Once()
	in := testInput()
	in.LateAfterMs = 1000
	in.CourierWaitMs = 2000
	env.ExecuteWorkflow(OrderWorkflow, in)
	require.NoError(t, env.GetWorkflowError())
	require.True(t, queryProgress(t, env).Express)
	env.AssertExpectations(t)
}
