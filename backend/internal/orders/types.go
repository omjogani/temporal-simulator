// Package orders holds the Temporal workflow, activities and the types shared
// between the controller and the worker processes.
package orders

import (
	"fmt"
	"strings"
	"time"
)

const (
	// TaskQueue is the single task queue every worker polls.
	TaskQueue = "orders"
	// WorkflowName is the registered workflow type name.
	WorkflowName = "OrderWorkflow"

	// MemoKey is where the workflow publishes its progress after each recorded step.
	MemoKey = "progress"

	SignalPause   = "pause"
	SignalResume  = "resume"
	QueryProgress = "progress"

	// ErrCardDeclined is a non-retryable application error type.
	ErrCardDeclined = "CardDeclined"

	// CompensationStep is the index used for the "Release stock" undo activity.
	CompensationStep = 4
	// ChargeStep is the index of the step that calls the Payments API.
	ChargeStep = 1
)

// StepNames are the human labels shown on the worker to-do list, by step index.
var StepNames = []string{"Reserve stock", "Charge card", "Ship order", "Send email", "Release stock ↩"}

// ActivityNames are the registered activity type names, by step index.
var ActivityNames = []string{"ReserveStock", "ChargeCard", "ShipOrder", "SendEmail", "ReleaseStock"}

// MainSteps is the number of forward steps in a normal order.
const MainSteps = 4

// RetrySpec mirrors temporal.RetryPolicy in a JSON-friendly shape.
type RetrySpec struct {
	InitialMs   int     `json:"initialMs"`
	Coefficient float64 `json:"coefficient"`
	MaxMs       int     `json:"maxMs"`
	MaxAttempts int     `json:"maxAttempts"` // 0 = unlimited
}

// Backoff returns the delay Temporal waits before the given next attempt (attempt >= 2).
func (r RetrySpec) Backoff(failedAttempt int) time.Duration {
	d := float64(r.InitialMs)
	for i := 1; i < failedAttempt; i++ {
		d *= r.Coefficient
	}
	if r.MaxMs > 0 && d > float64(r.MaxMs) {
		d = float64(r.MaxMs)
	}
	return time.Duration(d) * time.Millisecond
}

// OrderInput is the workflow input. Step-specific tuning travels with each order,
// so switching steps never needs a worker redeploy.
type OrderInput struct {
	OrderID        string    `json:"orderId"`
	Num            int       `json:"num"`
	Client         int       `json:"client"`
	Declined       bool      `json:"declined"`
	ActivityMs     int       `json:"activityMs"`
	StartToCloseMs int       `json:"startToCloseMs"`
	HeartbeatMs    int       `json:"heartbeatMs"`
	Retry          RetrySpec `json:"retry"`
}

// StepResult is returned by every activity.
type StepResult struct {
	Worker int `json:"worker"`
}

// Progress is published as a workflow memo and returned by the progress query.
type Progress struct {
	Done        []int `json:"done"` // worker id per completed step, in order
	Paused      bool  `json:"paused"`
	Declined    bool  `json:"declined"`
	Compensated bool  `json:"compensated"`
}

// Event is pushed by workers to the controller for live progress.
type Event struct {
	Type       string `json:"type"` // "started" | "finished"
	WorkflowID string `json:"workflowId"`
	Step       int    `json:"step"`
	Attempt    int    `json:"attempt"`
	Worker     int    `json:"worker"`
	DurationMs int    `json:"durationMs"`
	Error      string `json:"error,omitempty"`
	ErrorType  string `json:"errorType,omitempty"`
}

// WorkerNames are the pet names of the four workers (index = worker id, 1-based).
// Each one runs in its own Docker container named ContainerName(id).
var WorkerNames = [...]string{"", "Biscuit", "Mochi", "Pepper", "Noodle"}

// WorkerName returns the pet name for a worker id.
func WorkerName(id int) string {
	if id > 0 && id < len(WorkerNames) {
		return WorkerNames[id]
	}
	return fmt.Sprintf("Worker %d", id)
}

// ContainerName is the Docker container a worker runs in, e.g. "worker-biscuit".
func ContainerName(id int) string {
	return "worker-" + strings.ToLower(WorkerName(id))
}
