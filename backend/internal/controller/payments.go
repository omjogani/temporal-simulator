package controller

import (
	"encoding/json"
	"net/http"
	"time"
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
}

func newPayments() payments { return payments{byKey: map[string]int{}} }

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
	c.mu.Unlock()
	if slow {
		select {
		case <-time.After(5 * time.Second):
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
	case time.Now().Before(c.pay.downUntil):
		c.pay.failures++
		http.Error(w, "payments unavailable", http.StatusInternalServerError)
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		key = req.OrderID
	}
	if c.pay.byKey[key] > 0 {
		c.pay.deduped++
	} else {
		c.pay.charges++
	}
	c.pay.byKey[key]++
	if o := c.orders[req.OrderID]; o != nil {
		o.Charged = 1 // money moved exactly once, however many calls
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// SetPayments switches Payments to "down" (500s) or "slow" (5 s per call) for HammerDuration.
func (c *Controller) SetPayments(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	until := time.Now().Add(HammerDuration)
	switch mode {
	case "down":
		c.pay.downUntil = until
		c.say("Payments API returns 500s for 10 s. Charge card retries with backoff: 1 s, 2 s, 4 s, 8 s.")
	case "slow":
		c.pay.slowUntil = until
		c.say("Payments API takes 5 s per call for 10 s. The start-to-close timeout is %d s, so calls time out and retry.", c.step.StartToCloseMs/1000)
	}
}
