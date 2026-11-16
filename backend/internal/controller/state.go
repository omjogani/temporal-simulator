package controller

import (
	"time"

	"go.temporal.io/sdk/temporal"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// Step states shown on a worker's to-do list.
const (
	stPending     = "pending"
	stRunning     = "running"
	stReporting   = "reporting" // finished on the worker, not yet confirmed in history
	stDone        = "done"      // recorded in Temporal (from the progress memo)
	stBackoff     = "backoff"
	stInterrupted = "interrupted" // the worker running it was killed
	stFailed      = "failed"
	stSkipped     = "skipped"
)

// Order statuses.
const (
	osHolding     = "holding"     // client couldn't start it yet (Temporal down), retrying
	osQueued      = "queued"      // waiting in Temporal for a free worker
	osRunning     = "running"     // an activity is executing on a worker
	osBackoff     = "backoff"     // activity failed, retry scheduled
	osInterrupted = "interrupted" // its worker died mid-activity
	osFinishing   = "finishing"   // last step done, workflow closing
	osPaused      = "paused"
	osCompleted   = "completed"
	osFailed      = "failed"   // declined card, compensated
	osLost        = "lost"     // closed unexpectedly (should never happen)
	osCanceled    = "canceled" // cancellation requested, cleanup ran
)

// StepView is one row of the to-do list.
type StepView struct {
	State       string `json:"state"`
	Attempt     int    `json:"attempt"`
	StartedAt   int64  `json:"startedAt,omitempty"`
	DurationMs  int    `json:"durationMs,omitempty"`
	NextRetryAt int64  `json:"nextRetryAt,omitempty"`
	Error       string `json:"error,omitempty"`
	Worker      int    `json:"worker"`
}

// Order is the controller's view of one workflow.
type Order struct {
	ID             string     `json:"id"`
	Num            int        `json:"num"`
	Client         int        `json:"client"`
	Declined       bool       `json:"declined"`
	Status         string     `json:"status"`
	Worker         int        `json:"worker"`
	Steps          []StepView `json:"steps"`
	Current        int        `json:"current"`
	Charged        int        `json:"charged"`
	PauseRequested bool       `json:"pauseRequested"`
	EndedAt        int64      `json:"endedAt,omitempty"`
	GiftWrap       bool       `json:"giftWrap"`
	Address        string     `json:"address"`
	WaitUntil      int64      `json:"waitUntil"`
	Express        bool       `json:"express"`
	Timeout        string     `json:"timeout"`
	Stuck          string     `json:"stuck"`

	readyAt   time.Time
	createdAt time.Time
	priority  temporal.Priority
}

func newOrder(id string, num, client int, declined bool) *Order {
	o := &Order{ID: id, Num: num, Client: client, Declined: declined, Status: osHolding, Worker: -1, readyAt: time.Now(), createdAt: time.Now()}
	for i := 0; i < orders.MainSteps; i++ {
		o.Steps = append(o.Steps, StepView{State: stPending, Worker: -1})
	}
	return o
}

func (o *Order) terminal() bool {
	return o.Status == osCompleted || o.Status == osFailed || o.Status == osLost || o.Status == osCanceled
}

func (o *Order) ensureCompensation() {
	if len(o.Steps) <= orders.CompensationStep {
		o.Steps = append(o.Steps, StepView{State: stPending, Worker: -1})
	}
}

// markDeclined records a non-retryable failure on the charge step.
func (o *Order) markDeclined() {
	cs := &o.Steps[orders.ChargeStep]
	if cs.State != stDone {
		cs.State = stFailed
		cs.Error = orders.ErrCardDeclined
		cs.NextRetryAt = 0
	}
	for i := orders.ChargeStep + 1; i < orders.MainSteps; i++ {
		o.Steps[i].State = stSkipped
	}
	o.ensureCompensation()
}

func unixMs(t time.Time) int64 { return t.UnixMilli() }

// Snapshot is what the browser receives about 10 times a second.
type Snapshot struct {
	Now            int64            `json:"now"`
	Step           int              `json:"step"`
	Live           bool             `json:"live"`
	Temporal       TemporalView     `json:"temporal"`
	Workers        []WorkerView     `json:"workers"`
	Payments       PaymentsView     `json:"payments"`
	Orders         []*Order         `json:"orders"`
	Stats          StatsView        `json:"stats"`
	Sched          string           `json:"sched"`
	Waits          [4]int64         `json:"waits"`
	ClientDone     [4]int           `json:"clientDone"`
	Banner         BannerView       `json:"banner"`
	Retry          orders.RetrySpec `json:"retry"`
	StartToCloseMs int              `json:"startToCloseMs"`
	Speed          float64          `json:"speed"`
	Running        bool             `json:"running"` // clients are placing orders (the ▶ Play button)
	TemporalUI     string           `json:"temporalUi"`
	Scene          SceneView        `json:"scene"`
	Queue          QueueView        `json:"queue"`
}

// SceneView carries the idioms scene switches.
type SceneView struct {
	IdemKey bool   `json:"idemKey"`
	Build   string `json:"build"`
}

type TemporalView struct {
	Up        bool  `json:"up"`
	DownUntil int64 `json:"downUntil"`
}

type WorkerView struct {
	ID        int   `json:"id"`
	Up        bool  `json:"up"`
	DownUntil int64 `json:"downUntil"`
	Frozen    bool  `json:"frozen"`
	Completed int   `json:"completed"`
	// ReplayedAt is when this worker last rebuilt a workflow from history (unix ms),
	// ReplayedEvents how many history events that replay read.
	ReplayedAt     int64 `json:"replayedAt"`
	ReplayedEvents int64 `json:"replayedEvents"`
}

type PaymentsView struct {
	DownUntil int64 `json:"downUntil"`
	SlowUntil int64 `json:"slowUntil"`
	Charges   int   `json:"charges"`
	Deduped   int   `json:"deduped"`
	Failures  int   `json:"failures"`
}

type StatsView struct {
	Done       int `json:"done"`
	Failed     int `json:"failed"`
	Lost       int `json:"lost"`
	Canceled   int `json:"canceled"`
	Duplicates int `json:"duplicates"`
	Inflight   int `json:"inflight"`
	Paused     int `json:"paused"`
}

type BannerView struct {
	Seq  int    `json:"seq"`
	Text string `json:"text"`
}
