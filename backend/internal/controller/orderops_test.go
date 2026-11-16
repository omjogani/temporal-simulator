package controller

import (
	"context"
	"fmt"
	"testing"

	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

func TestApplyExecutionCanceled(t *testing.T) {
	c := newTestController(t)
	o := newOrder("o-1", 1, 0, false)
	c.orders[o.ID] = o
	c.applyExecution(o.ID, enumspb.WORKFLOW_EXECUTION_STATUS_CANCELED, &orders.Progress{Canceled: true})
	if o.Status != osCanceled || c.stats.Canceled != 1 || c.stats.Lost != 0 {
		t.Fatalf("status=%q canceled=%d lost=%d", o.Status, c.stats.Canceled, c.stats.Lost)
	}
	if !o.terminal() {
		t.Fatal("canceled order should be terminal")
	}
}

func TestApplyExecutionCopiesIdiomFields(t *testing.T) {
	c := newTestController(t)
	o := newOrder("o-2", 2, 0, false)
	c.orders[o.ID] = o
	c.applyExecution(o.ID, enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING, &orders.Progress{
		GiftWrap: true, Address: "221B Baker St", WaitUntil: 12345, Express: true, GaveUp: "ScheduleToClose",
	})
	if !o.GiftWrap || o.Address != "221B Baker St" || o.WaitUntil != 12345 || !o.Express || o.Timeout != "ScheduleToClose" {
		t.Fatalf("fields not copied: %+v", o)
	}
}

func TestOrderOpUnknownOrder(t *testing.T) {
	c := newTestController(t)
	r := c.OrderOp(context.Background(), "nope", "query", "")
	if r.OK || r.Text != "order already finished" || r.Tone != "dim" {
		t.Fatalf("reply = %+v", r)
	}
}

func TestOrderOpTerminalOrder(t *testing.T) {
	c := newTestController(t)
	o := newOrder("o-3", 3, 0, false)
	o.Status = osCompleted
	c.orders[o.ID] = o
	r := c.OrderOp(context.Background(), o.ID, "signal", "")
	if r.OK || r.Text != "order already finished" || r.Tone != "dim" {
		t.Fatalf("reply = %+v", r)
	}
}

func TestOpErrReply(t *testing.T) {
	want := OpReply{false, "Temporal unreachable, try again", "gold"}
	for _, err := range []error{context.DeadlineExceeded, serviceerror.NewUnavailable("down"), fmt.Errorf("wrapped: %w", context.DeadlineExceeded)} {
		if got := opErrReply(err); got != want {
			t.Fatalf("opErrReply(%v) = %+v", err, got)
		}
	}
	if got := opErrReply(fmt.Errorf("boom")); got.OK || got.Tone != "bad" || got.Text != "✗ boom" {
		t.Fatalf("generic = %+v", got)
	}
}

func TestSetSceneRefusesBadBuildOutsideStep105(t *testing.T) {
	c := newTestController(t)
	bad := "bad"
	c.SetScene(nil, &bad)
	if c.build != "good" {
		t.Fatalf("build = %q, want good", c.build)
	}
}
