package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

func (c *Controller) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", c.handleWS)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, map[string]bool{"ok": true}) })

	mux.HandleFunc("POST /api/step", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Step  int  `json:"step"`
			Force bool `json:"force"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetStep(b.Step, b.Force)
		writeJSON(w, map[string]int{"step": b.Step})
	})
	mux.HandleFunc("POST /api/scene", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			IdemKey *bool   `json:"idemKey"`
			Build   *string `json:"build"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetScene(b.IdemKey, b.Build)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/order", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			ID  string `json:"id"`
			Op  string `json:"op"`
			Arg string `json:"arg"`
		}
		if !decode(w, r, &b) {
			return
		}
		writeJSON(w, c.OrderOp(r.Context(), b.ID, b.Op, b.Arg))
	})
	mux.HandleFunc("GET /internal/deploy", func(w http.ResponseWriter, _ *http.Request) {
		c.mu.Lock()
		build := c.build
		c.mu.Unlock()
		writeJSON(w, map[string]string{"build": build})
	})
	mux.HandleFunc("POST /api/hammer", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Target string `json:"target"` // worker | workers | temporal
			Worker int    `json:"worker"`
		}
		if !decode(w, r, &b) {
			return
		}
		switch b.Target {
		case "worker":
			c.HammerWorker(b.Worker)
		case "workers":
			c.HammerAllWorkers()
		case "temporal":
			c.HammerTemporal()
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/freeze", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Worker int `json:"worker"`
		}
		if !decode(w, r, &b) {
			return
		}
		writeJSON(w, map[string]bool{"ok": c.freezeWorker(b.Worker)})
	})
	mux.HandleFunc("GET /api/history", c.handleHistory)
	mux.HandleFunc("POST /api/payments", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Mode string `json:"mode"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetPayments(b.Mode)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/load", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Kind string `json:"kind"` // flood | bulk | declined
		}
		if !decode(w, r, &b) {
			return
		}
		c.Load(b.Kind)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/sched", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Mode string `json:"mode"` // fifo | priority | fair
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetSched(b.Mode)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/speed", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Speed float64 `json:"speed"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetSpeed(b.Speed)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/run", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Run bool `json:"run"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.SetRunning(b.Run)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/pause", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			ID string `json:"id"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.Signal(orders.SignalPause, b.ID)
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/resume", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			ID string `json:"id"`
		}
		if !decode(w, r, &b) {
			return
		}
		c.Signal(orders.SignalResume, b.ID)
		writeJSON(w, map[string]bool{"ok": true})
	})

	// Called by the worker processes.
	mux.HandleFunc("POST /internal/events", func(w http.ResponseWriter, r *http.Request) {
		var ev orders.Event
		if !decode(w, r, &ev) {
			return
		}
		c.mu.Lock()
		c.applyEvent(ev)
		c.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /payments/charge", c.handleCharge)
	return cors(mux)
}

// ---------- actions ----------

// HammerWorker kills one worker container for HammerDuration.
func (c *Controller) HammerWorker(id int) {
	if id < 1 || id > numWorkers {
		return
	}
	if !c.killWorker(id, HammerDuration) {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if o := c.interruptedOrder(id); o != nil {
		done := 0
		for _, s := range o.Steps {
			if s.State == stDone || s.State == stReporting {
				done++
			}
		}
		c.say("docker kill %s: %s died during %s. Order #%d keeps its %d recorded steps; Temporal retries %s on a healthy worker after the heartbeat timeout.",
			containerOf(id), orders.WorkerName(id), stepName(o.Current), o.Num, done, stepName(o.Current))
	} else {
		c.say("docker kill %s: %s died while idle. It starts again in 10 s.", containerOf(id), orders.WorkerName(id))
	}
}

// HammerAllWorkers kills every worker for HammerDuration.
func (c *Controller) HammerAllWorkers() {
	for i := 1; i <= numWorkers; i++ {
		c.killWorker(i, HammerDuration)
	}
	c.mu.Lock()
	c.say("docker kill on all 4 worker containers. Orders wait in Temporal with their progress and continue when workers return in 10 s.")
	c.mu.Unlock()
}

// Load adds a burst of orders.
func (c *Controller) Load(kind string) {
	switch kind {
	case "flood":
		for i := 0; i < 30; i++ {
			c.NewOrder(i%4, false)
		}
		c.mu.Lock()
		c.say("30 orders incoming.")
		c.mu.Unlock()
	case "bulk":
		for i := 0; i < 40; i++ {
			c.NewOrder(3, false)
		}
		c.mu.Lock()
		c.say("Client 4 sends a bulk import of 40 orders.")
		c.mu.Unlock()
	case "declined":
		c.NewOrder(0, true)
		c.mu.Lock()
		c.say("An order with a card that will be declined is on its way.")
		c.mu.Unlock()
	}
}

// SetSched changes how new orders are tagged: plain FIFO, priority keys, or fairness keys.
func (c *Controller) SetSched(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	switch mode {
	case "fifo":
		c.say("FIFO: no priority or fairness keys. First in, first out.")
	case "priority":
		c.say("Priority: Client 1 orders start with PriorityKey 1, everyone else 3. Lower runs first.")
	case "fair":
		c.say("Fairness: each client's orders get their own FairnessKey, so workers take turns between clients.")
	default:
		return
	}
	c.sched = mode
}

// ---------- websocket ----------

type wsHub struct {
	mu      sync.Mutex
	clients map[chan []byte]struct{}
}

func newHub() *wsHub { return &wsHub{clients: map[chan []byte]struct{}{}} }

func (h *wsHub) add() chan []byte {
	ch := make(chan []byte, 2)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *wsHub) remove(ch chan []byte) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

func (h *wsHub) broadcast(b []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- b:
		default: // slow client: skip this frame
		}
	}
}

func (c *Controller) broadcastLoop(ctx context.Context) {
	t := time.NewTicker(100 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if b := c.snapshot(); b != nil {
				c.hub.broadcast(b)
			}
		}
	}
}

func (c *Controller) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"localhost:*", "127.0.0.1:*"}})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	ctx := conn.CloseRead(r.Context())
	ch := c.hub.add()
	defer c.hub.remove(ch)
	for {
		select {
		case <-ctx.Done():
			return
		case b := <-ch:
			wctx, cancel := context.WithTimeout(ctx, 2*time.Second)
			err := conn.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// ---------- helpers ----------

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
