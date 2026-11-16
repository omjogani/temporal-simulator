// Package controller runs the demo: it starts and kills the worker containers, can kill the
// Temporal container, hosts a fake Payments API, generates client load and
// streams a state snapshot to the browser.
package controller

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sort"
	"sync"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/omjogani/temporal-simulator/backend/internal/steps"
	"github.com/omjogani/temporal-simulator/backend/internal/tclient"
)

// HammerDuration is how long a hammered worker or Temporal stays down.
const HammerDuration = 10 * time.Second

const numWorkers = 4

// Config is set from command-line flags.
type Config struct {
	Port             int
	TemporalHostPort string
	Container        string
	TemporalUI       string
}

// Controller holds all demo state. Fields below mu are guarded by it.
type Controller struct {
	cfg     Config
	tc      client.Client
	selfURL string
	hub     *wsHub

	mu         sync.Mutex
	step       steps.Step
	stepSetAt  time.Time
	session    string
	runStart   time.Time
	num        int
	orders     map[string]*Order
	order      []*Order // creation order
	workers    [numWorkers + 1]*workerProc
	temporalUp bool
	tDownUntil time.Time
	pay        payments
	sched      string
	speed      float64 // visual/time scale: 0.25 (slow) … 2 (fast); kept across steps
	waits      [4][]time.Duration
	clientDone [4]int
	stats      StatsView
	banner     BannerView
	loadCancel context.CancelFunc // non-nil while clients are placing orders
	startKick  chan struct{}
	idemKey    bool   // idioms: orders carry an idempotency key
	build      string // idioms: "good" | "bad" workflow build
}

// New creates a controller. Temporal does not need to be up yet.
func New(cfg Config) (*Controller, error) {
	tc, err := client.NewLazyClient(tclient.Options(cfg.TemporalHostPort, "controller"))
	if err != nil {
		return nil, err
	}
	c := &Controller{
		cfg:       cfg,
		tc:        tc,
		selfURL:   fmt.Sprintf("http://127.0.0.1:%d", cfg.Port),
		hub:       newHub(),
		orders:    map[string]*Order{},
		sched:     "fifo",
		startKick: make(chan struct{}, 1),
		step:      steps.Get(1),
		pay:       newPayments(),
		speed:     1,
		idemKey:   true,
		build:     "good",
	}
	for i := 1; i <= numWorkers; i++ {
		c.workers[i] = &workerProc{id: i}
	}
	return c, nil
}

// Run starts workers and background loops, then serves HTTP until ctx ends.
func (c *Controller) Run(ctx context.Context) error {
	// Claim the port first so a clash fails before any worker is spawned.
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", c.cfg.Port))
	if err != nil {
		return err
	}
	c.ensureContainerRunning()
	for i := 1; i <= numWorkers; i++ {
		c.startWorker(i)
	}
	go c.dockerWatchLoop(ctx.Done())
	go c.healthLoop(ctx)
	go c.pollLoop(ctx)
	go c.starterLoop(ctx)
	go c.broadcastLoop(ctx)
	go c.terminateRunning(context.Background())

	srv := &http.Server{Handler: c.routes()}
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(shut)
	}()
	log.Printf("controller listening on http://localhost:%d (Temporal %s, UI %s)", c.cfg.Port, c.cfg.TemporalHostPort, c.cfg.TemporalUI)
	// Worker containers keep running when the controller stops; `make down` stops them.
	err = srv.Serve(ln)
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func randomID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// say sets the banner line shown under the board. Caller holds mu.
// scaled divides a duration in ms by the speed. Caller holds mu.
func (c *Controller) scaled(ms int) int {
	return int(float64(ms) / c.speed)
}

// SetSpeed scales activity durations, client pace, the start-to-close timeout
// and slow-Payments delay for orders started from now on. Hammer outages and
// retry backoff stay in real seconds.
func (c *Controller) SetSpeed(v float64) {
	if v < 0.25 {
		v = 0.25
	}
	if v > 2 {
		v = 2
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if v == c.speed {
		return
	}
	c.speed = v
	c.say("Speed %.2gx: new orders run activities of %.1f s.", v, float64(c.scaled(c.step.ActivityMs))/1000)
}

func (c *Controller) say(format string, args ...any) {
	c.banner.Seq++
	c.banner.Text = fmt.Sprintf(format, args...)
}

// SetStep resets the demo for a route. Live steps get fresh workers and load.
func (c *Controller) SetStep(n int, force bool) {
	c.mu.Lock()
	if !force && c.step.ID == n && time.Since(c.stepSetAt) < 3*time.Second {
		c.mu.Unlock()
		return // React dev mode and reconnects can send the same step twice
	}
	if c.loadCancel != nil {
		c.loadCancel()
		c.loadCancel = nil
	}
	c.step = steps.Get(n)
	c.stepSetAt = time.Now()
	c.session = randomID(3)
	c.runStart = time.Now()
	c.num = 0
	c.orders = map[string]*Order{}
	c.order = nil
	c.pay = newPayments()
	c.waits = [4][]time.Duration{}
	c.clientDone = [4]int{}
	c.stats = StatsView{}
	c.sched = "fifo"
	c.resetSceneLocked()
	c.banner = BannerView{Seq: c.banner.Seq + 1}
	for i := 1; i <= numWorkers; i++ {
		c.workers[i].completed = 0
	}
	live := c.step.Live
	c.mu.Unlock()

	go c.terminateRunning(context.Background())
	if live {
		// Fresh worker containers so nothing from the previous step lingers in their caches.
		// Clients stay idle until the presenter presses Play (SetRunning).
		go c.restartAllWorkers()
	}
}

// resetSceneLocked restores the idioms scene switches. Caller holds mu.
func (c *Controller) resetSceneLocked() {
	c.idemKey = true
	c.build = "good"
}

// SetScene flips the idioms switches. A changed build restarts all workers so
// they boot with the new build.
func (c *Controller) SetScene(idemKey *bool, build *string) {
	c.mu.Lock()
	if idemKey != nil {
		c.idemKey = *idemKey
	}
	deploy := false
	if build != nil && (*build == "good" || *build == "bad") && *build != c.build {
		c.build = *build
		deploy = true
		c.say("Deploying the %s build: restarting all 4 worker containers.", c.build)
	}
	c.mu.Unlock()
	if deploy {
		go c.restartAllWorkers()
	}
}

// SetRunning starts (true) or stops (false) the four clients placing orders.
// Orders already in flight carry on either way.
func (c *Controller) SetRunning(run bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.step.Live || run == (c.loadCancel != nil) {
		return
	}
	if !run {
		c.loadCancel()
		c.loadCancel = nil
		c.say("Paused: clients stopped placing orders. Orders in flight finish.")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.loadCancel = cancel
	for cl := 0; cl < 4; cl++ {
		go c.clientLoop(ctx, cl)
	}
}

// waitFor returns the time-to-finish to show for a client: the larger of the
// recent average and the age of its oldest open order (so starvation shows live).
// Caller holds mu.
func (c *Controller) waitFor(client int, now time.Time) time.Duration {
	var sum time.Duration
	for _, d := range c.waits[client] {
		sum += d
	}
	var avg time.Duration
	if n := len(c.waits[client]); n > 0 {
		avg = sum / time.Duration(n)
	}
	oldest := time.Duration(0)
	for _, o := range c.order {
		if o.Client == client && !o.terminal() && o.Status != osPaused {
			if d := now.Sub(o.createdAt); d > oldest {
				oldest = d
			}
		}
	}
	if oldest > avg {
		return oldest
	}
	return avg
}

func (c *Controller) recordWait(client int, d time.Duration) {
	w := append(c.waits[client], d)
	if len(w) > 6 {
		w = w[len(w)-6:]
	}
	c.waits[client] = w
}

// snapshot serialises current state. Also prunes long-finished orders.
func (c *Controller) snapshot() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	nowMs := unixMs(now)

	s := Snapshot{
		Now:            nowMs,
		Step:           c.step.ID,
		Live:           c.step.Live,
		Temporal:       TemporalView{Up: c.temporalUp, DownUntil: unixMs(c.tDownUntil)},
		Payments:       c.pay.view(),
		Sched:          c.sched,
		Banner:         c.banner,
		Retry:          c.step.Retry,
		StartToCloseMs: c.scaled(c.step.StartToCloseMs),
		Speed:          c.speed,
		Running:        c.loadCancel != nil,
		TemporalUI:     c.cfg.TemporalUI,
		Stats:          c.stats,
		Scene:          SceneView{IdemKey: c.idemKey, Build: c.build},
		Orders:         []*Order{},
	}
	for i := 1; i <= numWorkers; i++ {
		w := c.workers[i]
		s.Workers = append(s.Workers, WorkerView{ID: i, Up: w.up, DownUntil: unixMs(w.downUntil), Completed: w.completed, ReplayedAt: w.replayedAt, ReplayedEvents: w.replayedEvents})
	}

	kept := c.order[:0]
	for _, o := range c.order {
		if o.terminal() && nowMs-o.EndedAt > 8000 {
			continue // drop from the list; the map entry stays so late memos are ignored
		}
		kept = append(kept, o)
		if !o.terminal() {
			s.Stats.Inflight++
			if o.Status == osPaused {
				s.Stats.Paused++
			}
		}
		if !o.terminal() || nowMs-o.EndedAt < 2500 {
			s.Orders = append(s.Orders, o)
		}
	}
	c.order = kept
	sort.SliceStable(s.Orders, func(i, j int) bool { return s.Orders[i].Num < s.Orders[j].Num })
	for cl := 0; cl < 4; cl++ {
		s.Waits[cl] = c.waitFor(cl, now).Milliseconds()
		s.ClientDone[cl] = c.clientDone[cl]
	}
	b, err := json.Marshal(s)
	if err != nil {
		log.Printf("snapshot: %v", err)
		return nil
	}
	return b
}
