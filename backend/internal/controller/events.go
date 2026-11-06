package controller

import (
	"strings"
	"time"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// applyEvent merges a worker's started/finished report. Caller holds mu.
func (c *Controller) applyEvent(ev orders.Event) {
	o := c.orders[ev.WorkflowID]
	if o == nil || o.terminal() {
		return
	}
	if ev.Step == orders.CompensationStep {
		o.ensureCompensation()
	}
	if ev.Step < 0 || ev.Step >= len(o.Steps) {
		return
	}
	st := &o.Steps[ev.Step]
	now := time.Now()

	switch ev.Type {
	case "started":
		if st.State == stDone {
			return
		}
		st.State = stRunning
		st.Attempt = ev.Attempt
		st.StartedAt = unixMs(now)
		st.DurationMs = ev.DurationMs
		st.Worker = ev.Worker
		st.NextRetryAt = 0
		st.Error = ""
		o.Current = ev.Step
		o.Worker = ev.Worker
		o.Status = osRunning

	case "finished":
		if st.State != stRunning || st.Attempt != ev.Attempt {
			return // an attempt we already gave up on (e.g. its worker was killed)
		}
		o.Worker = -1
		if ev.Error == "" {
			st.State = stReporting
			o.readyAt = now
			if ev.Step >= orders.MainSteps-1 {
				o.Status = osFinishing
			} else {
				o.Status = osQueued
			}
			return
		}
		if ev.ErrorType == orders.ErrCardDeclined {
			o.markDeclined()
			o.Status = osQueued
			o.readyAt = now
			c.say("Order #%d: card declined. CardDeclined is non-retryable, so no retries. The workflow releases the stock.", o.Num)
			return
		}
		st.State = stBackoff
		st.Error = shortError(ev)
		st.NextRetryAt = unixMs(now.Add(c.step.Retry.Backoff(ev.Attempt)))
		o.Status = osBackoff
	}
}

func shortError(ev orders.Event) string {
	switch {
	case ev.ErrorType == "Timeout", strings.Contains(ev.Error, "deadline"), strings.Contains(ev.Error, "timeout"):
		return "timed out"
	case strings.Contains(ev.Error, "500"):
		return "Payments 500"
	case ev.ErrorType != "":
		return ev.ErrorType
	}
	return "error"
}
