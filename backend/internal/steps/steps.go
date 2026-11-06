// Package steps holds per-route settings for the live (Temporal-backed) steps.
// Steps 1 and 2 are browser-only illustrations and have no backend config.
package steps

import "github.com/omjogani/temporal-simulator/backend/internal/orders"

// Step configures load and Temporal options for one route.
type Step struct {
	ID             int
	Live           bool
	ActivityMs     int
	EveryMs        [2]int // per-client gap between new orders
	StartToCloseMs int
	HeartbeatMs    int
	Retry          orders.RetrySpec
}

var defaultRetry = orders.RetrySpec{InitialMs: 1000, Coefficient: 2, MaxMs: 8000, MaxAttempts: 0}

var all = map[int]Step{
	1: {ID: 1},
	2: {ID: 2},
	// Durability: generous timeouts; a killed worker is detected by the 2 s heartbeat timeout.
	3: {ID: 3, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Timeouts & retries: 3 s start-to-close so a 5 s slow Payments call times out.
	4: {ID: 4, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 3000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Priority & fairness: short activities so a backlog drains visibly.
	5: {ID: 5, Live: true, ActivityMs: 500, EveryMs: [2]int{3500, 5000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Pause & resume.
	6: {ID: 6, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
}

// Get returns the config for a step, falling back to step 1.
func Get(id int) Step {
	if s, ok := all[id]; ok {
		return s
	}
	return all[1]
}
