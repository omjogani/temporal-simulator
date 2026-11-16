package controller

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// payments is a fake card processor with fault switches. It honours the
// Idempotency-Key header, so a retried charge never moves money twice.
type payments struct {
	downUntil time.Time
	slowUntil time.Time
	charges   int
	deduped   int
	failures  int
	byKey     map[string]int
	faults    map[string]fault
}

// fault is a one-order failure the presenter injected. Kind is "500"
// (Left calls fail, then it clears) or "declined" (a non-retryable 402).
type fault struct {
	Kind string
	Left int
}

func newPayments() payments {
	return payments{byKey: map[string]int{}, faults: map[string]fault{}}
}

func (p *payments) view() PaymentsView {
	return PaymentsView{
		DownUntil: unixMs(p.downUntil), SlowUntil: unixMs(p.slowUntil),
		Charges: p.charges, Deduped: p.deduped, Failures: p.failures,
	}
}

type chargeRequest struct {
	OrderID  string `json:"orderId"`
	Num      int    `json:"num"`
	Declined bool   `json:"declined"`
}

func (c *Controller) handleCharge(w http.ResponseWriter, r *http.Request) {
	var req chargeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	c.mu.Lock()
	slow := time.Now().Before(c.pay.slowUntil)
	slowFor := time.Duration(c.scaled(5000)) * time.Millisecond
	c.mu.Unlock()
	if slow {
		select {
		case <-time.After(slowFor):
		case <-r.Context().Done(): // the activity hit its start-to-close timeout
			c.mu.Lock()
			c.pay.failures++
			c.mu.Unlock()
			return
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	switch {
	case req.Declined:
		c.pay.failures++
		http.Error(w, "card declined", http.StatusPaymentRequired)
		return
	}
	if f, ok := c.pay.faults[req.OrderID]; ok {
		switch f.Kind {
		case "declined":
			c.pay.failures++
			http.Error(w, "card declined", http.StatusPaymentRequired)
			return
		case "500":
			if f.Left--; f.Left <= 0 {
				delete(c.pay.faults, req.OrderID)
			} else {
				c.pay.faults[req.OrderID] = f
			}
			c.pay.failures++
			http.Error(w, "payments unavailable", http.StatusInternalServerError)
			return
		}
	}
	switch {
	case time.Now().Before(c.pay.downUntil):
		c.pay.failures++
		http.Error(w, "payments unavailable", http.StatusInternalServerError)
		return
	}
	// Without the header Payments cannot tell a retry from a new order: it never dedups.
	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		if c.pay.byKey[req.OrderID] > 0 {
			c.stats.Duplicates++
		}
		c.pay.charges++
		c.pay.byKey[req.OrderID]++
		if o := c.orders[req.OrderID]; o != nil {
			o.Charged = min(c.pay.byKey[req.OrderID], 2) // 2 renders as the duplicate ring
		}
	} else {
		if c.pay.byKey[key] > 0 {
			c.pay.deduped++
		} else {
			c.pay.charges++
		}
		c.pay.byKey[key]++
		if o := c.orders[req.OrderID]; o != nil {
			o.Charged = 1 // money moved exactly once, however many calls
		}
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// InjectFault arms a one-order Payments fault ("500" or "declined") unless the
// order has already been charged.
func (c *Controller) InjectFault(orderID, kind string) (bool, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	o := c.orders[orderID]
	if o == nil {
		return false, "unknown order"
	}
	if st := o.Steps[orders.ChargeStep].State; st == stDone || st == stReporting {
		return false, "already charged"
	}
	switch kind {
	case "500":
		c.pay.faults[orderID] = fault{Kind: kind, Left: 2}
	case "declined":
		c.pay.faults[orderID] = fault{Kind: kind}
	default:
		return false, "unknown fault"
	}
	return true, "fault armed"
}

// SetPayments switches Payments to "down" (500s), "downLong" (500s for 20 s) or
// "slow" (5 s per call). down and slow last HammerDuration.
func (c *Controller) SetPayments(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	until := time.Now().Add(HammerDuration)
	switch mode {
	case "down":
		c.pay.downUntil = until
		c.say("Payments API returns 500s for 10 s. Charge card retries with backoff: 1 s, 2 s, 4 s, 8 s.")
	case "downLong":
		c.pay.downUntil = time.Now().Add(2 * HammerDuration)
		c.say("Payments API returns 500s for 20 s. Charge card keeps retrying with backoff.")
	case "slow":
		c.pay.slowUntil = until
		c.say("Payments API takes %.1f s per call for 10 s. The start-to-close timeout is %.1f s, so calls time out and retry.",
			float64(c.scaled(5000))/1000, float64(c.scaled(c.step.StartToCloseMs))/1000)
	}
}
