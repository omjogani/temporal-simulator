package controller

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// OpReply is the answer to one per-order operation, shown as a speech bubble.
type OpReply struct {
	OK   bool   `json:"ok"`
	Text string `json:"text"`
	Tone string `json:"tone"` // good | bad | gold | dim
}

const opTimeout = 3 * time.Second

// opErrReply turns a failed Temporal call into a reply: an unreachable server is
// gold ("try again"), anything else is the error text in bad.
func opErrReply(err error) OpReply {
	var unavailable *serviceerror.Unavailable
	var deadline *serviceerror.DeadlineExceeded // what the SDK's gRPC interceptor returns when the 3 s context expires
	if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &unavailable) || errors.As(err, &deadline) {
		return OpReply{false, "Temporal unreachable, try again", "gold"}
	}
	return OpReply{false, "✗ " + errMessage(err), "bad"}
}

// errMessage prefers the application error's own message (a rejected update).
func errMessage(err error) string {
	var app *temporal.ApplicationError
	if errors.As(err, &app) {
		return app.Message()
	}
	return err.Error()
}

// OrderOp runs one presenter action against one order. It never holds mu across a
// Temporal call.
func (c *Controller) OrderOp(ctx context.Context, id, op, arg string) OpReply {
	c.mu.Lock()
	o := c.orders[id]
	var num int
	if o != nil && !o.terminal() {
		num = o.Num
	}
	c.mu.Unlock()
	if num == 0 {
		return OpReply{false, "order already finished", "dim"}
	}
	if op == "inject" {
		ok, text := c.InjectFault(id, arg)
		tone := "good"
		if !ok {
			tone = "bad"
		}
		return c.said(OpReply{ok, text, tone})
	}

	cctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	var r OpReply
	switch op {
	case "signal":
		if err := c.tc.SignalWorkflow(cctx, id, "", orders.SignalGiftWrap, nil); err != nil {
			return c.said(opErrReply(err))
		}
		r = OpReply{true, "🎀 gift wrap signal sent (no reply)", "dim"}
	case "query":
		var p orders.Progress
		v, err := c.tc.QueryWorkflow(cctx, id, "", orders.QueryProgress)
		if err == nil {
			err = v.Get(&p)
		}
		if err != nil {
			return c.said(opErrReply(err))
		}
		r = OpReply{true, queryText(num, p), "good"}
	case "update":
		h, err := c.tc.UpdateWorkflow(cctx, client.UpdateWorkflowOptions{
			WorkflowID:   id,
			UpdateName:   orders.UpdateChangeAddress,
			Args:         []any{"221B Baker St"},
			WaitForStage: client.WorkflowUpdateStageCompleted,
		})
		var res string
		if err == nil {
			err = h.Get(cctx, &res)
		}
		if err != nil {
			return c.said(opErrReply(err))
		}
		r = OpReply{true, "✓ " + res, "good"}
	case "cancel":
		if err := c.tc.CancelWorkflow(cctx, id, ""); err != nil {
			return c.said(opErrReply(err))
		}
		r = OpReply{true, "✂ cancel requested: cleanup will run", "gold"}
	default:
		return OpReply{false, "unknown operation", "bad"}
	}
	return c.said(r)
}

// said repeats a reply in the banner.
func (c *Controller) said(r OpReply) OpReply {
	c.mu.Lock()
	c.say("%s", r.Text)
	c.mu.Unlock()
	return r
}

func queryText(num int, p orders.Progress) string {
	cur := len(p.Done)
	if cur >= orders.MainSteps {
		cur = orders.MainSteps - 1
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "#%d · %s · %d/%d done", num, stepName(cur), len(p.Done), orders.MainSteps)
	if p.GiftWrap {
		sb.WriteString(" · 🎀")
	}
	if p.Address != "" {
		sb.WriteString(" · to " + p.Address)
	}
	return sb.String()
}
