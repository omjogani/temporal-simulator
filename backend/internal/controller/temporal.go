package controller

import (
	"context"
	"fmt"
	"log"
	"math/rand/v2"
	"os/exec"
	"sync"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"
	"go.temporal.io/sdk/temporal"

	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

// ---------- container ----------

func docker(args ...string) error {
	out, err := exec.Command("docker", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %v: %v: %s", args, err, out)
	}
	return nil
}

func (c *Controller) ensureContainerRunning() {
	if err := docker("start", c.cfg.Container); err != nil {
		log.Printf("could not start %s (run `docker compose up -d` first): %v", c.cfg.Container, err)
	}
}

// HammerTemporal kills the Temporal container and starts it again after HammerDuration.
func (c *Controller) HammerTemporal() {
	c.mu.Lock()
	if time.Now().Before(c.tDownUntil) {
		c.mu.Unlock()
		return
	}
	c.tDownUntil = time.Now().Add(HammerDuration)
	c.temporalUp = false
	c.say("Temporal Service killed (docker kill). Workers and clients keep retrying; it comes back in 10 s.")
	c.mu.Unlock()

	go func() {
		if err := docker("kill", c.cfg.Container); err != nil {
			log.Print(err)
		}
		time.Sleep(HammerDuration)
		if err := docker("start", c.cfg.Container); err != nil {
			log.Print(err)
		}
	}()
}

func (c *Controller) healthLoop(ctx context.Context) {
	t := time.NewTicker(500 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		hctx, cancel := context.WithTimeout(ctx, 700*time.Millisecond)
		_, err := c.tc.CheckHealth(hctx, &client.CheckHealthRequest{})
		cancel()
		c.mu.Lock()
		wasUp := c.temporalUp
		c.temporalUp = err == nil && time.Now().After(c.tDownUntil)
		if !wasUp && c.temporalUp && !c.tDownUntil.IsZero() {
			c.say("Temporal Service is back. Every workflow continues from its history.")
			c.tDownUntil = time.Time{}
			c.kickStarter()
		}
		c.mu.Unlock()
	}
}

// ---------- reading state back from Temporal ----------

// pollLoop reads every workflow of the current run (status + progress memo).
func (c *Controller) pollLoop(ctx context.Context) {
	t := time.NewTicker(400 * time.Millisecond)
	defer t.Stop()
	dc := converter.GetDefaultDataConverter()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		c.mu.Lock()
		live, up, since := c.step.Live, c.temporalUp, c.runStart
		c.mu.Unlock()
		if !live || !up {
			continue
		}
		query := fmt.Sprintf("WorkflowType = '%s' AND StartTime >= '%s'", orders.WorkflowName, since.Add(-2*time.Second).UTC().Format(time.RFC3339))
		var token []byte
		for {
			lctx, cancel := context.WithTimeout(ctx, 2*time.Second)
			resp, err := c.tc.ListWorkflow(lctx, &workflowservice.ListWorkflowExecutionsRequest{Query: query, PageSize: 1000, NextPageToken: token})
			cancel()
			if err != nil {
				break
			}
			c.mu.Lock()
			for _, ex := range resp.Executions {
				var p *orders.Progress
				if ex.Memo != nil {
					if pl, ok := ex.Memo.Fields[orders.MemoKey]; ok {
						var pp orders.Progress
						if dc.FromPayload(pl, &pp) == nil {
							p = &pp
						}
					}
				}
				c.applyExecution(ex.Execution.WorkflowId, ex.Status, p)
			}
			c.mu.Unlock()
			token = resp.NextPageToken
			if len(token) == 0 {
				break
			}
		}
	}
}

// applyExecution merges what Temporal says about one workflow. Caller holds mu.
func (c *Controller) applyExecution(id string, status enumspb.WorkflowExecutionStatus, p *orders.Progress) {
	o := c.orders[id]
	if o == nil || o.terminal() {
		return
	}
	now := time.Now()
	if p != nil {
		for i, w := range p.Done {
			if i < len(o.Steps) && o.Steps[i].State != stDone {
				o.Steps[i].State = stDone
				o.Steps[i].Worker = w
				o.Steps[i].NextRetryAt = 0
				o.Steps[i].Error = ""
				if o.Current <= i {
					o.Current = i + 1
				}
			}
		}
		if p.Declined {
			o.markDeclined()
		}
		if p.Compensated {
			o.ensureCompensation()
			o.Steps[orders.CompensationStep].State = stDone
		}
		o.GiftWrap = p.GiftWrap
		o.Address = p.Address
		o.WaitUntil = p.WaitUntil
		o.Express = p.Express
		o.Timeout = p.GaveUp
		if p.Paused && (o.Status == osQueued || o.Status == osFinishing) {
			o.Status = osPaused
			o.PauseRequested = false
		}
		if !p.Paused && o.Status == osPaused {
			o.Status = osQueued
			o.readyAt = now
		}
	}
	switch status {
	case enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED:
		o.Status = osCompleted
		o.EndedAt = unixMs(now)
		o.Worker = -1
		c.stats.Done++
		c.clientDone[o.Client]++
		c.recordWait(o.Client, now.Sub(o.createdAt))
		last := o.Steps[orders.MainSteps-1].Worker
		if last >= 1 && last <= numWorkers {
			c.workers[last].completed++
		}
	case enumspb.WORKFLOW_EXECUTION_STATUS_FAILED:
		o.Status = osFailed
		o.EndedAt = unixMs(now)
		o.Worker = -1
		c.stats.Failed++
	case enumspb.WORKFLOW_EXECUTION_STATUS_CANCELED:
		o.Status = osCanceled
		o.EndedAt = unixMs(now)
		o.Worker = -1
		c.stats.Canceled++
	case enumspb.WORKFLOW_EXECUTION_STATUS_TERMINATED, enumspb.WORKFLOW_EXECUTION_STATUS_TIMED_OUT:
		o.Status = osLost
		o.EndedAt = unixMs(now)
		c.stats.Lost++
	}
}

// terminateRunning cleans up workflows left over from a previous step or run.
func (c *Controller) terminateRunning(ctx context.Context) {
	query := fmt.Sprintf("WorkflowType = '%s' AND ExecutionStatus = 'Running'", orders.WorkflowName)
	for attempt := 0; attempt < 3; attempt++ {
		lctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		resp, err := c.tc.ListWorkflow(lctx, &workflowservice.ListWorkflowExecutionsRequest{Query: query, PageSize: 1000})
		cancel()
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, 16)
		for _, ex := range resp.Executions {
			wg.Add(1)
			sem <- struct{}{}
			go func(id string) {
				defer wg.Done()
				defer func() { <-sem }()
				tctx, cancel := context.WithTimeout(ctx, 3*time.Second)
				defer cancel()
				_ = c.tc.TerminateWorkflow(tctx, id, "", "simulator step changed")
			}(ex.Execution.WorkflowId)
		}
		wg.Wait()
		return
	}
}

// ---------- starting workflows (the clients) ----------

func (c *Controller) kickStarter() {
	select {
	case c.startKick <- struct{}{}:
	default:
	}
}

// clientLoop is one client placing orders at the step's pace.
func (c *Controller) clientLoop(ctx context.Context, client int) {
	first := time.Duration(200+rand.IntN(1500)) * time.Millisecond
	timer := time.NewTimer(first)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		c.NewOrder(client, false)
		c.mu.Lock()
		every := c.step.EveryMs
		gap := c.scaled(every[0] + rand.IntN(every[1]-every[0]+1))
		c.mu.Unlock()
		timer.Reset(time.Duration(gap) * time.Millisecond)
	}
}

// NewOrder registers an order as "holding" and wakes the starter.
func (c *Controller) NewOrder(client int, declined bool) {
	c.mu.Lock()
	if !c.step.Live {
		c.mu.Unlock()
		return
	}
	c.num++
	id := fmt.Sprintf("order-%s-%d", c.session, c.num)
	o := newOrder(id, c.num, client, declined)
	switch c.sched {
	case "priority":
		o.priority = temporal.Priority{PriorityKey: 3}
		if client == 0 {
			o.priority.PriorityKey = 1
		}
	case "fair":
		o.priority = temporal.Priority{FairnessKey: fmt.Sprintf("client-%d", client+1), FairnessWeight: 1}
	}
	c.orders[id] = o
	c.order = append(c.order, o)
	c.mu.Unlock()
	c.kickStarter()
}

// starterLoop starts holding orders in order. While Temporal is down the
// starts fail and the orders wait at their client, exactly like a real client
// retrying StartWorkflow.
func (c *Controller) starterLoop(ctx context.Context) {
	t := time.NewTicker(300 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-c.startKick:
		}
		c.mu.Lock()
		var pending []*Order
		for _, o := range c.order {
			if o.Status == osHolding {
				pending = append(pending, o)
			}
		}
		step := c.step
		actMs, stcMs := c.scaled(step.ActivityMs), c.scaled(step.StartToCloseMs)
		courierMs := c.scaled(step.CourierWaitMs)
		noIdem := !c.idemKey
		c.mu.Unlock()

		for _, o := range pending {
			in := orders.OrderInput{
				OrderID: o.ID, Num: o.Num, Client: o.Client, Declined: o.Declined,
				ActivityMs: actMs, StartToCloseMs: stcMs, HeartbeatMs: step.HeartbeatMs, Retry: step.Retry,
				NoIdempotencyKey: noIdem, CourierWaitMs: courierMs,
				ScheduleToCloseMs: step.ScheduleToCloseMs, LateAfterMs: courierMs / 2,
			}
			sctx, cancel := context.WithTimeout(ctx, 2*time.Second)
			_, err := c.tc.ExecuteWorkflow(sctx, client.StartWorkflowOptions{
				ID:        o.ID,
				TaskQueue: orders.TaskQueue,
				Priority:  o.priority,
			}, orders.WorkflowName, in)
			cancel()
			if err != nil {
				break // Temporal unreachable; keep holding and retry on the next tick
			}
			c.mu.Lock()
			if o.Status == osHolding {
				o.Status = osQueued
				o.readyAt = time.Now()
			}
			c.mu.Unlock()
		}
	}
}

// Signal sends pause/resume to one order (id) or every open order (id == "").
func (c *Controller) Signal(name, id string) {
	c.mu.Lock()
	var targets []*Order
	for _, o := range c.order {
		if o.terminal() || o.Status == osHolding {
			continue
		}
		if id == "" || o.ID == id {
			targets = append(targets, o)
			if name == orders.SignalPause {
				o.PauseRequested = true
			} else {
				o.PauseRequested = false
			}
		}
	}
	if len(targets) == 1 {
		if name == orders.SignalPause {
			c.say("Pause signal sent to order #%d. It stops before its next step and keeps its progress.", targets[0].Num)
		} else {
			c.say("Resume signal sent to order #%d. It continues from %s.", targets[0].Num, stepName(targets[0].Current))
		}
	} else if len(targets) > 1 {
		c.say("%s signal sent to %d orders.", map[string]string{orders.SignalPause: "Pause", orders.SignalResume: "Resume"}[name], len(targets))
	}
	c.mu.Unlock()
	for _, o := range targets {
		go func(id string) {
			sctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = c.tc.SignalWorkflow(sctx, id, "", name, nil)
		}(o.ID)
	}
}
