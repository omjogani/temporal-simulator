package controller

import (
	"strings"
	"testing"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

func TestApplyReplayedEvent(t *testing.T) {
	c, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	o := newOrder("o-7", 7, 0, false)
	o.Current = 2
	c.orders[o.ID] = o
	c.applyEvent(orders.Event{Type: "replayed", WorkflowID: "o-7", Worker: 2, Events: 9})
	if c.workers[2].replayedEvents != 9 || c.workers[2].replayedAt == 0 {
		t.Fatalf("worker 2 replay not recorded: %+v", c.workers[2])
	}
	if !strings.Contains(c.banner.Text, "replaying 9 events") || !strings.Contains(c.banner.Text, "#7") {
		t.Fatalf("banner = %q", c.banner.Text)
	}
}
