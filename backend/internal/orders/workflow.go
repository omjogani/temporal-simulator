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
	// Captured for the deliberately bad build's late decision below.
	startedAt := time.Now()
	p := Progress{Done: []int{}}
	paused := false
	rw := newReplayWatch(ctx)

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

	workflow.Go(ctx, func(gctx workflow.Context) {
		ch := workflow.GetSignalChannel(gctx, SignalGiftWrap)
		for {
			ch.Receive(gctx, nil)
			p.GiftWrap = true
			save()
		}
	})
	if err := workflow.SetUpdateHandlerWithOptions(ctx, UpdateChangeAddress,
		func(ctx workflow.Context, addr string) (string, error) {
			p.Address = addr
			save()
			return "address changed to " + addr, nil
		},
		workflow.UpdateHandlerOptions{Validator: func(ctx workflow.Context, addr string) error {
			if len(p.Done) > ShipStep {
				return errors.New(ErrAlreadyShipped)
			}
			return nil
		}},
	); err != nil {
		return "", err
	}

	opts := workflow.ActivityOptions{
		StartToCloseTimeout: ms(in.StartToCloseMs),
		HeartbeatTimeout:    ms(in.HeartbeatMs),
		WaitForCancellation: true,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:        ms(in.Retry.InitialMs),
			BackoffCoefficient:     in.Retry.Coefficient,
			MaximumInterval:        ms(in.Retry.MaxMs),
			MaximumAttempts:        int32(in.Retry.MaxAttempts),
			NonRetryableErrorTypes: []string{ErrCardDeclined},
		},
	}
	if in.ScheduleToCloseMs > 0 {
		opts.ScheduleToCloseTimeout = ms(in.ScheduleToCloseMs)
	}
	actx := workflow.WithActivityOptions(ctx, opts)

	// fail handles cancellation and schedule-to-close give-ups, then returns err.
	fail := func(err error) (string, error) {
		var te *temporal.TimeoutError
		switch {
		case temporal.IsCanceledError(err):
			dctx, _ := workflow.NewDisconnectedContext(ctx)
			dctx = workflow.WithActivityOptions(dctx, opts)
			_ = workflow.ExecuteActivity(dctx, ActivityNames[CompensationStep], in).Get(dctx, nil)
			p.Canceled = true
			_ = workflow.UpsertMemo(dctx, map[string]any{MemoKey: p})
		case errors.As(err, &te):
			p.GaveUp = te.TimeoutType().String()
			save()
		}
		return "", err
	}

	for i := 0; i < MainSteps; i++ {
		if paused {
			p.Paused = true
			save()
			if err := workflow.Await(ctx, func() bool { return !paused }); err != nil {
				return fail(err)
			}
			rw.check(ctx)
			p.Paused = false
			save()
		}

		name := ActivityNames[i]
		if i == ShipStep && in.LateAfterMs > 0 {
			var late bool
			if Build == "bad" {
				// BAD BUILD (demo only): time.Now is not recorded in history, so a replay
				// re-reads the wall clock, computes "on time" and schedules a different
				// activity than history recorded: a non-determinism error.
				late = time.Since(startedAt) > ms(in.LateAfterMs)
			} else {
				late = workflow.Now(ctx).Sub(workflow.GetInfo(ctx).WorkflowStartTime) > ms(in.LateAfterMs)
			}
			if late {
				name = ActivityShipExpress
				p.Express = true
				save()
			}
		}

		var r StepResult
		err := workflow.ExecuteActivity(actx, name, in).Get(actx, &r)
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
			return fail(err)
		}
		rw.check(ctx)
		p.Done = append(p.Done, r.Worker)
		save()
		if i == ChargeStep && in.CourierWaitMs > 0 {
			p.WaitUntil = workflow.Now(ctx).Add(ms(in.CourierWaitMs)).UnixMilli()
			save()
			if err := workflow.Sleep(ctx, ms(in.CourierWaitMs)); err != nil {
				return fail(err)
			}
			rw.check(ctx)
			p.WaitUntil = 0
			save()
		}
	}
	return "shipped", nil
}
