package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

func newTestController(t *testing.T) *Controller {
	t.Helper()
	c, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	c.orders["o1"] = newOrder("o1", 1, 0, false)
	return c
}

func charge(c *Controller, key string) int {
	r := httptest.NewRequest(http.MethodPost, "/payments/charge", strings.NewReader(`{"orderId":"o1","num":1}`))
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	c.handleCharge(w, r)
	return w.Code
}

func TestFault500TwiceThenOK(t *testing.T) {
	c := newTestController(t)
	if ok, text := c.InjectFault("o1", "500"); !ok {
		t.Fatal(text)
	}
	got := []int{charge(c, "o1"), charge(c, "o1"), charge(c, "o1")}
	if got[0] != 500 || got[1] != 500 || got[2] != 200 {
		t.Fatalf("got %v, want [500 500 200]", got)
	}
}

func TestFaultDeclined402(t *testing.T) {
	c := newTestController(t)
	if ok, text := c.InjectFault("o1", "declined"); !ok {
		t.Fatal(text)
	}
	if code := charge(c, "o1"); code != 402 {
		t.Fatalf("got %d, want 402", code)
	}
}

func TestNoKeyDoubleCharge(t *testing.T) {
	c := newTestController(t)
	charge(c, "")
	charge(c, "")
	if c.stats.Duplicates != 1 || c.orders["o1"].Charged != 2 {
		t.Fatalf("duplicates=%d charged=%d, want 1/2", c.stats.Duplicates, c.orders["o1"].Charged)
	}
}

func TestKeyDedups(t *testing.T) {
	c := newTestController(t)
	charge(c, "o1")
	charge(c, "o1")
	if c.pay.deduped != 1 || c.stats.Duplicates != 0 {
		t.Fatalf("deduped=%d duplicates=%d, want 1/0", c.pay.deduped, c.stats.Duplicates)
	}
}

func TestInjectAfterChargeRefused(t *testing.T) {
	c := newTestController(t)
	c.orders["o1"].Steps[orders.ChargeStep].State = stDone
	ok, text := c.InjectFault("o1", "500")
	if ok || text != "already charged" {
		t.Fatalf("ok=%v text=%q", ok, text)
	}
}
