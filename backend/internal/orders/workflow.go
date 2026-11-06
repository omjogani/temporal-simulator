package orders

import (
	"errors"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

func ms(n int) time.Duration { return time.Duration(n) * time.Millisecond }

// OrderWorkflow runs Reserve stock → Charge card → Ship order → Send email.
//
//   - Progress is upserted as a memo after every step Temporal has recorded, so the
//     UI's ticks reflect history, not what a worker claims.
//   - "pause" / "resume" signals hold the workflow before its next step.
//   - A declined card is non-retryable: the workflow releases the stock and fails.
func OrderWorkflow(ctx workflow.Context, in OrderInput) (string, error) {
	p := Progress{Done: []int{}}
	paused := false

	pauseCh := workflow.GetSignalChannel(ctx, SignalPause)
	resumeCh := workflow.GetSignalChannel(ctx, SignalResume)
	workflow.Go(ctx, func(gctx workflow.Context) {
		for {
			sel := workflow.NewSelector(gctx)
			sel.AddReceive(pauseCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(gctx, nil); paused = true })
			sel.AddReceive(resumeCh, func(c workflow.ReceiveChannel, _ bool) { c.Receive(gctx, nil); paused = false })
			sel.Select(gctx)
		}
	})
	if err := workflow.SetQueryHandler(ctx, QueryProgress, func() (Progress, error) { return p, nil }); err != nil {
		return "", err
	}
	save := func() { _ = workflow.UpsertMemo(ctx, map[string]any{MemoKey: p}) }
	save()

	actx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: ms(in.StartToCloseMs),
		HeartbeatTimeout:    ms(in.HeartbeatMs),
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:        ms(in.Retry.InitialMs),
			BackoffCoefficient:     in.Retry.Coefficient,
			MaximumInterval:        ms(in.Retry.MaxMs),
			MaximumAttempts:        int32(in.Retry.MaxAttempts),
			NonRetryableErrorTypes: []string{ErrCardDeclined},
		},
	})

	for i := 0; i < MainSteps; i++ {
		if paused {
			p.Paused = true
			save()
			if err := workflow.Await(ctx, func() bool { return !paused }); err != nil {
				return "", err
			}
			p.Paused = false
			save()
		}

		var r StepResult
		err := workflow.ExecuteActivity(actx, ActivityNames[i], in).Get(actx, &r)
		if err != nil {
			var app *temporal.ApplicationError
			if errors.As(err, &app) && app.Type() == ErrCardDeclined {
				p.Declined = true
				save()
				// Compensation: undo what already happened (the stock reservation).
				if cerr := workflow.ExecuteActivity(actx, ActivityNames[CompensationStep], in).Get(actx, nil); cerr != nil {
					return "", cerr
				}
				p.Compensated = true
				save()
				return "", temporal.NewNonRetryableApplicationError("card declined, stock released", ErrCardDeclined, nil)
			}
			return "", err
		}
		p.Done = append(p.Done, r.Worker)
		save()
	}
	return "shipped", nil
}
