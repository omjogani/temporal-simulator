// Package steps holds per-route settings for the live (Temporal-backed) steps.
// Step 1 is a browser-only illustration and has no backend config.
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

	// Idioms scenes (101-108).
	CourierWaitMs     int  // workflow waits this long for the courier before delivering
	ScheduleToCloseMs int  // overall activity deadline (0 = none)
	Scene             bool // true for idioms scenes
}

var defaultRetry = orders.RetrySpec{InitialMs: 1000, Coefficient: 2, MaxMs: 8000, MaxAttempts: 0}

var all = map[int]Step{
	1: {ID: 1},
	// Durability: generous timeouts; a killed worker is detected by the 2 s heartbeat timeout.
	2: {ID: 2, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Timeouts & retries: 3 s start-to-close so a 5 s slow Payments call times out.
	3: {ID: 3, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 3000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Priority & fairness: short activities so a backlog drains visibly.
	4: {ID: 4, Live: true, ActivityMs: 500, EveryMs: [2]int{3500, 5000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
	// Pause & resume.
	5: {ID: 5, Live: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry},
}

func scene(id int, mod func(*Step)) Step {
	s := Step{ID: id, Live: true, Scene: true, ActivityMs: 1200, EveryMs: [2]int{6000, 8000}, StartToCloseMs: 10000, HeartbeatMs: 2000, Retry: defaultRetry}
	if mod != nil {
		mod(&s)
	}
	return s
}

func init() {
	all[101] = scene(101, func(s *Step) { s.CourierWaitMs = 4000 })
	all[102] = scene(102, func(s *Step) { s.CourierWaitMs = 4000 })
	all[103] = scene(103, nil)
	all[104] = scene(104, nil)
	all[105] = scene(105, func(s *Step) { s.CourierWaitMs = 6000 })
	all[106] = scene(106, func(s *Step) { s.StartToCloseMs = 3000; s.ScheduleToCloseMs = 12000 })
	all[107] = scene(107, func(s *Step) { s.ActivityMs = 800; s.EveryMs = [2]int{2500, 3500} })
	all[108] = scene(108, func(s *Step) { s.ActivityMs = 2000; s.CourierWaitMs = 5000 })
}

// Get returns the config for a step, falling back to step 1.
func Get(id int) Step {
	if s, ok := all[id]; ok {
		return s
	}
	return all[1]
}
