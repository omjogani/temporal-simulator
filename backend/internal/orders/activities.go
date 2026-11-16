package orders

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
)

// Activities are the order steps. Each one "works" for ActivityMs while
// heartbeating, so a killed worker is noticed after the heartbeat timeout.
// Charge card calls the controller's fake Payments API halfway through.
type Activities struct {
	WorkerID      int
	ControllerURL string
	HTTP          *http.Client
}

func (a *Activities) ReserveStock(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, 0)
}
func (a *Activities) ChargeCard(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, 1)
}
func (a *Activities) ShipOrder(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, 2)
}
func (a *Activities) ShipExpress(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, ShipStep)
}
func (a *Activities) SendEmail(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, 3)
}
func (a *Activities) ReleaseStock(ctx context.Context, in OrderInput) (StepResult, error) {
	return a.run(ctx, in, CompensationStep)
}

func (a *Activities) run(ctx context.Context, in OrderInput, step int) (StepResult, error) {
	info := activity.GetInfo(ctx)
	ev := Event{
		WorkflowID: info.WorkflowExecution.ID,
		Step:       step,
		Attempt:    int(info.Attempt),
		Worker:     a.WorkerID,
		DurationMs: in.ActivityMs,
	}
	ev.Type = "started"
	a.emit(ev)

	err := a.work(ctx, in, step)

	ev.Type = "finished"
	if err != nil {
		ev.Error = err.Error()
		var app *temporal.ApplicationError
		if errors.As(err, &app) {
			ev.ErrorType = app.Type()
		} else if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			ev.ErrorType = "Timeout"
		}
	}
	a.emit(ev)
	if err != nil {
		return StepResult{}, err
	}
	return StepResult{Worker: a.WorkerID}, nil
}

func (a *Activities) work(ctx context.Context, in OrderInput, step int) error {
	total := time.Duration(in.ActivityMs) * time.Millisecond
	half := total / 2
	if err := sleepHeartbeat(ctx, half); err != nil {
		return err
	}
	if step == ChargeStep {
		if err := a.charge(ctx, in); err != nil {
			return err
		}
	}
	return sleepHeartbeat(ctx, total-half)
}

func sleepHeartbeat(ctx context.Context, d time.Duration) error {
	deadline := time.NewTimer(d)
	defer deadline.Stop()
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	activity.RecordHeartbeat(ctx)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			return nil
		case <-tick.C:
			activity.RecordHeartbeat(ctx)
		}
	}
}

type chargeRequest struct {
	OrderID  string `json:"orderId"`
	Num      int    `json:"num"`
	Declined bool   `json:"declined"`
}

func (a *Activities) charge(ctx context.Context, in OrderInput) error {
	body, _ := json.Marshal(chargeRequest{OrderID: in.OrderID, Num: in.Num, Declined: in.Declined})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.ControllerURL+"/payments/charge", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	// The workflow ID makes retries safe: Payments charges each order at most once.
	req.Header.Set("Idempotency-Key", in.OrderID)
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("payments unreachable: %w", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusPaymentRequired:
		return temporal.NewNonRetryableApplicationError("card declined", ErrCardDeclined, nil)
	case resp.StatusCode >= 300:
		return temporal.NewApplicationError(fmt.Sprintf("payments returned %d", resp.StatusCode), "PaymentsUnavailable")
	}
	return nil
}

// emit sends an event to the controller without blocking the activity.
func (a *Activities) emit(ev Event) {
	go func() {
		body, _ := json.Marshal(ev)
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.ControllerURL+"/internal/events", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if resp, err := a.HTTP.Do(req); err == nil {
			resp.Body.Close()
		}
	}()
}
