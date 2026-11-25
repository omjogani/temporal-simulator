# Temporal Idioms Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Idioms" section of eight interactive scenes. Each scene teaches one rule
of the Temporal programming model on the existing arena board, backed by real Temporal.

**Architecture:**
- Each idiom scene is a live step to the controller, with IDs **101–108**. Scene `k` is
  shown at `/idioms/k` and sets controller step `100+k`. `SetStep`, the snapshot and the
  WebSocket are reused unchanged.
- `OrderWorkflow` gains the idioms: a signal, an update, cancellation, a durable timer, a
  build-dependent "late order" decision and schedule-to-close.
- The controller gains:
  - per-order operations;
  - a describe/observe loop (timeouts, stuck workflow tasks, task-queue pollers);
  - a history endpoint;
  - `docker pause` (freeze).
- The frontend generalises `SimulatorPage` to take a step config, adds clickable parcels
  plus new tools, and adds a code panel and a history strip.

**Tech Stack:** Go 1.27, `go.temporal.io/sdk` v1.50.0 (incl. `testsuite`), Temporal
server 1.32.1, Next.js 16 / React 19, vitest, PixiJS (existing FxCanvas).

**Spec:** `docs/superpowers/specs/2026-11-16-temporal-idioms-design.md`

## Global Constraints

- Everything an idiom scene shows must come from real Temporal or real workers. Nothing is
  simulated in the idioms section (AGENTS.md "Honesty").
- Ports and containers:
  - Only touch `temporal-sim` and `worker-*`.
  - Never touch `temporal` / `temporal-ui` (:7233 / :8233).
  - Controller :18080, Next :13000.
- Workflow code stays deterministic, except for the **deliberately bad build**
  (`build == "bad"`), which only scene 105 can deploy.
- Scenes 101–108 route at `/idioms/1`…`/idioms/8`. The menu shows one "Idioms" cartridge
  after step 5. ←/→ inside the section moves between scenes and never jumps into /1–/5.
- Atomic design and CSS Modules with tokens. No new npm or Go dependencies.
- Effects (particles, sounds) come from diffing consecutive `ArenaView`s. The one exception
  is the speech bubble, which shows the HTTP reply to the presenter's own click.
- Hotkeys in idioms scenes:
  - `1`–`8` jump to a scene.
  - Tools: `V` select, `H` hammer, `E` error, `G` signal, `Q` query, `U` update,
    `X` cancel, `C` freeze.
  - `R` reset, Space play, `-`/`+` speed, `M` sound, `Esc` menu.
- Commits: Conventional Commits, small, on branch `feat/temporal-idomatics`.
- Checks after every task:
  `cd backend && go vet ./... && go build ./... && go test ./...` and
  `cd frontend && pnpm test && pnpm lint && pnpm build`.

## Review Focus

1. **Clicking a parcel that finished or vanished between render and click.** The API
   returns `{ok:false,text:"order already finished"}` and the bubble shows it in grey. It
   must not throw or show a fake success. Test in Task 5.
2. **An update after shipping, or a cancel during compensation.** The validator rejects with
   "already shipped". A cancel after the order completed returns "already finished". Tests
   in Task 2 and Task 5.
3. **Temporal down while the presenter uses a tool.** The op times out after 3 s and the bubble
   shows "Temporal unreachable, try again" in gold. There is no silent drop. Test in Task 5.
4. **Leaving scene 105 with the bad build deployed.** Every `SetStep` resets the build to
   `good` and restarts the workers, so no stuck orders leak into other steps. Test in Task 1.
5. **A frozen (`docker pause`) worker when the scene changes or the controller resets.**
   `SetStep` unpauses every worker before restarting. A paused container must never be
   left behind. Test in Task 6.

---

### Task 1: Scene configs, scene state and build deploy

**Files:**
- Modify: `backend/internal/steps/steps.go`
- Modify: `backend/internal/orders/types.go`
- Modify: `backend/internal/controller/controller.go`
- Modify: `backend/internal/controller/api.go`
- Modify: `backend/internal/orders/worker.go`
- Test: `backend/internal/steps/steps_test.go`, `backend/internal/controller/scene_test.go`

**Interfaces:**
- Produces:
  - `steps.Step` fields:
    - `CourierWaitMs int`
    - `ScheduleToCloseMs int`
    - `Scene bool` (true for 101–108)
  - `steps.Get(101..108)`.
  - `orders.OrderInput` fields:
    - `NoIdempotencyKey bool`
    - `CourierWaitMs int`
    - `ScheduleToCloseMs int`
    - `LateAfterMs int`
  - `orders.Build` (package var, `"good"` | `"bad"`, default `"good"`).
  - Controller:
    - fields `idemKey bool` (default true) and `build string` (default `"good"`);
    - `SetScene(idemKey *bool, build *string)`;
    - `Snapshot.Scene SceneView{IdemKey bool; Build string}`.
  - Routes:
    - `POST /api/scene {idemKey?: bool, build?: "good"|"bad"}`;
    - `GET /internal/deploy` → `{"build":"good"}`.

- [ ] **Step 1: Write failing tests.**
  - `TestSceneConfigs`: `steps.Get(n).Live && steps.Get(n).Scene` for n in 101..108.
  - `steps.Get(105).CourierWaitMs == 6000`.
  - `steps.Get(106).ScheduleToCloseMs == 12000`.
  - `!steps.Get(2).Scene`.
  - `TestSetStepResetsScene`: build a `Controller` with `New(Config{})`, set `c.build = "bad"`
    and `c.idemKey = false`, then call a new pure helper `c.resetSceneLocked()`. Assert
    `build == "good"` and `idemKey == true`.
- [ ] **Step 2: Run** `cd backend && go test ./internal/steps ./internal/controller`.
  Expected: FAIL (undefined fields).
- [ ] **Step 3: Implement.** Scene table (ActivityMs 1200, EveryMs {6000,8000},
  StartToCloseMs 10000, HeartbeatMs 2000, defaultRetry unless noted):

  | ID | Scene | Overrides |
  |---|---|---|
  | 101 | Workflow vs activity | CourierWaitMs 4000 |
  | 102 | History & replay | CourierWaitMs 4000 |
  | 103 | Retryable vs non-retryable | (none) |
  | 104 | Idempotency | (none) |
  | 105 | Determinism | CourierWaitMs 6000 |
  | 106 | Timeouts | StartToCloseMs 3000, ScheduleToCloseMs 12000 |
  | 107 | Workers & task queues | ActivityMs 800, EveryMs {2500,3500} |
  | 108 | Talking to a workflow | ActivityMs 2000, CourierWaitMs 5000 |

  - `LateAfterMs` = `CourierWaitMs/2` when CourierWaitMs > 0, else 0.
  - `starterLoop` copies the new fields into `OrderInput`. Courier wait is scaled by speed
    like ActivityMs. `NoIdempotencyKey = !c.idemKey`.
  - `SetStep` calls `resetSceneLocked()`.
  - `SetScene` with a changed build sets `c.build`, says "Deploying the
    <good|bad> build: restarting all 4 worker containers.", then runs
    `go c.restartAllWorkers()`.
  - In `RunWorker`, before `worker.New`, GET `controllerURL+"/internal/deploy"` with a 2 s
    timeout and set `orders.Build`. On error keep `"good"` and log it.
- [ ] **Step 4: Run tests.** Expected: PASS. Run the full backend check line.
- [ ] **Step 5: Commit.** `feat(backend): add idiom scene configs and build deploy`

### Task 2: Workflow idioms

**Files:**
- Modify: `backend/internal/orders/workflow.go`, `types.go`, `activities.go`, `worker.go`
- Test: `backend/internal/orders/workflow_test.go` (new, `go.temporal.io/sdk/testsuite`)

**Interfaces:**
- Consumes: the `OrderInput` fields and `orders.Build` from Task 1.
- Produces: constants
  - `SignalGiftWrap = "giftWrap"`
  - `UpdateChangeAddress = "changeAddress"`
  - `ShipStep = 2`
  - `ErrAlreadyShipped = "already shipped"`
  - activity `"ShipExpress"`, registered as `(*Activities).ShipExpress`, which runs step
    index 2 like `ShipOrder`.
- `Progress` gains:
  - `GiftWrap bool`
  - `Address string`
  - `WaitUntil int64` (unix ms, the courier timer end; 0 when not waiting)
  - `Canceled bool`
  - `Express bool`
  - `GaveUp string` (timeout type name, e.g. `"ScheduleToClose"`)
- **Behaviour:**
  - **`giftWrap` signal:** sets `p.GiftWrap = true` and saves. No reply.
  - **`changeAddress` update (arg `string`, returns `string`):**
    - The validator rejects when `len(p.Done) > ShipStep` with
      `errors.New(ErrAlreadyShipped)`.
    - Otherwise the handler sets `p.Address`, saves, and returns `"address changed to <arg>"`.
  - **Courier timer:** after step index 1 (Charge) is recorded, if `in.CourierWaitMs > 0`:
    set `p.WaitUntil = workflow.Now(ctx).Add(ms(in.CourierWaitMs)).UnixMilli()`, save,
    `workflow.Sleep`, then set `WaitUntil = 0` and save.
  - **Late decision:** made right before the ship step when `in.LateAfterMs > 0`.
    - Good build: `late := workflow.Now(ctx).Sub(workflow.GetInfo(ctx).WorkflowStartTime) > ms(in.LateAfterMs)`.
    - Bad build: `late := time.Since(startedAt) > ms(in.LateAfterMs)`, where
      `startedAt := time.Now()` is captured at the top of the workflow function.
    - Late → activity `ShipExpress` and `p.Express = true`. On time → `ShipOrder`.
    - A comment states why the bad build is wrong: time.Now is re-read on replay, so a
      replay computes "on time" and schedules a different activity.
  - **Cancellation:**
    - Activity options set `WaitForCancellation: true`, so the running activity sees the
      cancel through its heartbeat.
    - On `temporal.IsCanceledError(err)`, run `ReleaseStock` with
      `workflow.NewDisconnectedContext(ctx)` plus the same activity options. Set
      `p.Canceled = true`, save with the disconnected ctx, and return the original
      canceled error, so the workflow status is CANCELED.
    - A cancel during the courier timer takes the same path: `Sleep` returns a canceled error.
  - **Schedule-to-close:** `ScheduleToCloseTimeout = ms(in.ScheduleToCloseMs)` when > 0. On a
    `*temporal.TimeoutError` set `p.GaveUp = te.TimeoutType().String()`, save, and return
    the error.

- [ ] **Step 1: Write failing tests** with `testsuite.WorkflowTestSuite`. Register the
  activities from `&Activities{}` and mock each one with `env.OnActivity(...)`.
  - `TestGiftWrapSignal`: signal via `env.RegisterDelayedCallback(..., 0)`, then query
    `progress`, then assert `GiftWrap`.
  - `TestChangeAddressAcceptedBeforeShip`: update at callback time 0 →
    `Complete("address changed to 221B")`.
  - `TestChangeAddressRejectedAfterShip`: update after all activities complete → the
    rejection error message is `already shipped`.
  - `TestCancelRunsCleanup`: `env.CancelWorkflow()` during the courier timer → `ReleaseStock`
    was called (mock `.Once()`), `env.GetWorkflowError()` is canceled, and the final query
    shows `Canceled == true`.
  - `TestLateGoodBuildShipsExpress`: `LateAfterMs: 1000, CourierWaitMs: 2000`,
    `Build="good"` → `ShipExpress` is called, not `ShipOrder`.
- [ ] **Step 2: Run** `go test ./internal/orders -run 'Test' -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the behaviour above in `workflow.go`, and `ShipExpress` in
  `activities.go`. Register it automatically via `RegisterActivity(&Activities{...})`;
  no change is needed in `worker.go` beyond Task 1.
- [ ] **Step 4: Run tests and the full backend check.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(backend): add signal, update, cancellation and timer idioms to the order workflow`

### Task 3: Real replay reporting

**Files:**
- Create: `backend/internal/orders/replay.go`
- Modify: `workflow.go`, `worker.go`, `types.go`
- Modify: `backend/internal/controller/events.go`, `state.go`, `controller.go` (snapshot)
- Test: `backend/internal/orders/replay_test.go`, `backend/internal/controller/events_test.go`

**Interfaces:**
- Produces:
  - `orders.ReplayHook func(workflowID string, events int64)`, a package var set by
    `RunWorker` that posts `Event{Type:"replayed", WorkflowID, Worker:id, Events:n}`.
  - `Event.Events int64`.
  - `type replayWatch struct{...}` with `newReplayWatch(ctx workflow.Context) *replayWatch`
    and `(*replayWatch).check(ctx workflow.Context)`.
  - `WorkerView` fields `ReplayedAt int64` and `ReplayedEvents int64`.
- `newReplayWatch` records whether the function started with `workflow.IsReplaying(ctx)`.
  `check` is called after every awaited step. The first time it sees `!IsReplaying`
  after starting in replay, it calls
  `ReplayHook(id, workflow.GetInfo(ctx).GetCurrentHistoryLength())` once. It adds no
  commands (comment: demo side channel, outside workflow logic).
- The controller's `applyEvent` handles `"replayed"`:
  - it sets the worker's `replayedAt` / `replayedEvents`;
  - it says "<Pet> rebuilt order #N by replaying <n> events from history, then continued
    at <step>."

- [ ] **Step 1: Failing tests.**
  - `TestReplayWatchSilentWhenNotReplaying` (testsuite run, hook not called).
  - `TestApplyReplayedEvent`: a controller with one order; apply the `replayed` event;
    assert `workers[2].replayedEvents == 9` and that the banner contains "replaying 9 events".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Expected: PASS. Live check:
  1. `make up && make dev`.
  2. Open `/idioms/2`, press play.
  3. Hammer a worker mid-order.
  4. The banner shows a real replay with a non-zero event count.
- [ ] **Step 5: Commit.** `feat: report real workflow replays to the board`

### Task 4: Payments faults and the idempotency switch

**Files:**
- Modify: `backend/internal/controller/payments.go`, `backend/internal/orders/activities.go`
- Test: `backend/internal/controller/payments_test.go` (httptest against `c.handleCharge`)

**Interfaces:**
- Produces:
  - `payments.faults map[string]fault` with `type fault struct{ Kind string; Left int }`.
    `Kind` is `"500"` (Left = 2 failing calls) or `"declined"`.
  - `(*Controller).InjectFault(orderID, kind string) (ok bool, text string)`.
  - `SetPayments("downLong")`: down for 20 s.
- Charge handling:
  - A `"declined"` fault returns 402, like `req.Declined`.
  - A `"500"` fault returns 500 and decrements `Left`; it is deleted at 0.
  - **No `Idempotency-Key` header:** never dedup. If the order was already charged, increment
    `c.stats.Duplicates`, set `o.Charged = 2` (frontend dup ring) and count it as a charge.
  - The activity omits the header when `in.NoIdempotencyKey`.
- `InjectFault` refuses when the order's charge step is already done or reporting:
  `false, "already charged"`.

- [ ] **Step 1: Failing tests.**
  - `TestFault500TwiceThenOK`: three calls → 500, 500, 200.
  - `TestFaultDeclined402`: one call → 402.
  - `TestNoKeyDoubleCharge`: two calls without the header → `stats.Duplicates == 1` and
    `o.Charged == 2`.
  - `TestKeyDedups`: two calls with the header → `pay.deduped == 1` and
    `stats.Duplicates == 0`.
  - `TestInjectAfterChargeRefused`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(backend): add per-order payment faults and the idempotency switch`

### Task 5: Per-order operations and new order states

**Files:**
- Create: `backend/internal/controller/orderops.go`
- Modify: `api.go`, `temporal.go` (`applyExecution`), `state.go`
- Test: `backend/internal/controller/orderops_test.go`, `state_test.go`

**Interfaces:**
- Consumes: the Task 2 constants and `Progress` fields, and Task 4 `InjectFault`.
- Produces:
  - `POST /api/order {id, op, arg}`, where `op` ∈
    `signal | query | update | cancel | inject`.
  - Response `{ok bool, text string, tone "good"|"bad"|"gold"|"dim"}`.
  - `(*Controller).OrderOp(ctx, id, op, arg string) OpReply`.
- `Order` gains:
  - `GiftWrap bool`
  - `Address string`
  - `WaitUntil int64`
  - `Express bool`
  - `Timeout string`
  - `Stuck string`
  - status `osCanceled = "canceled"`
- `applyExecution` copies the new `Progress` fields. `CANCELED` maps to `osCanceled`
  (not lost) and increments `stats.Canceled`, a new `StatsView.Canceled`.
  `TERMINATED` / `TIMED_OUT` stay lost.
- `OrderOp` details:
  - **Unknown or terminal order:** `{false, "order already finished", "dim"}`.
  - **signal:** `SignalWorkflow` → `{true, "🎀 gift wrap signal sent (no reply)", "dim"}`.
  - **query:** `QueryWorkflow(progress)` → text
    `"#N · <current step> · <done>/4 done"`, plus `" · 🎀"` when gift-wrapped and
    `" · to <addr>"` when the address changed. Tone `"good"`.
  - **update:** `UpdateWorkflow` with `WaitForStage: client.WorkflowUpdateStageCompleted`
    and arg `"221B Baker St"`.
    - Accepted → `{true, "✓ " + result, "good"}`.
    - Rejected → `{false, "✗ " + errMsg, "bad"}`.
  - **cancel:** `CancelWorkflow` → `{true, "✂ cancel requested: cleanup will run", "gold"}`.
  - **inject:** `InjectFault(id, arg)`.
  - **Timeouts:** every Temporal call has a 3 s timeout. On a deadline or unavailable
    error → `{false, "Temporal unreachable, try again", "gold"}`.
  - The banner repeats the text.

- [ ] **Step 1: Failing tests.**
  - `TestApplyExecutionCanceled` (status CANCELED → `osCanceled`, `Stats.Canceled == 1`,
    `Lost == 0`).
  - `TestApplyExecutionCopiesIdiomFields`.
  - `TestOrderOpUnknownOrder` (no Temporal needed: the order is not in the map).
  - `TestOrderOpTerminalOrder`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Expected: PASS. Live check on `/idioms/8` (after Task 9), or
  with curl now:
  ```
  curl -XPOST :18080/api/order -d '{"id":"<id>","op":"update"}'
  ```
- [ ] **Step 5: Commit.** `feat(backend): add per-order signal, query, update, cancel and fault endpoints`

### Task 6: Observers: timeouts, stuck tasks, task queue, history, freeze

**Files:**
- Create: `backend/internal/controller/observe.go`, `history.go`
- Modify: `procs.go` (freeze), `api.go`, `controller.go` (start loops, snapshot)
- Test: `backend/internal/controller/observe_test.go`

**Interfaces:**
- Produces:
  - `describeLoop(ctx)`: every 800 ms, only when `step.ID` is 105 or 106. It calls
    `DescribeWorkflowExecution` for each open order.
    - From `PendingActivities[0].LastFailure.GetTimeoutFailureInfo().GetTimeoutType()`, set
      `o.Timeout` to `"start-to-close"`, `"heartbeat"` or `"schedule-to-close"` (via
      `timeoutLabel(enumspb.TimeoutType) string`).
    - When `PendingWorkflowTask.Attempt > 1`, fetch
      `GetWorkflowExecutionHistoryReverse` (page size 10). If the newest
      `WorkflowTaskFailed` has cause `WORKFLOW_TASK_FAILED_CAUSE_NON_DETERMINISTIC_ERROR`,
      set `o.Stuck = "nondeterminism"`; clear it once the attempt is back to 1.
  - `queueLoop(ctx)`: every 700 ms on all live steps.
    `DescribeTaskQueueEnhanced{TaskQueue: orders.TaskQueue, ReportPollers: true, ReportStats: true}`
    gives `Snapshot.Queue QueueView{Pollers []int; Backlog int64}`.
    - Pollers: workflow and activity pollers. Map identity `worker-<pet>` to the worker id
      with `workerIDFromIdentity(string) int`. Keep pollers whose last access is < 5 s old.
    - Backlog: the sum of `ApproximateBacklogCount` over the types.
    - Verify the method in `go doc go.temporal.io/sdk/client Client.DescribeTaskQueueEnhanced`
      before use.
  - `GET /api/history?id=` → `[]HistEvent{ID int64; Kind string; Label string; Worker int; T int64}`.
    - `Kind`: `started`, `scheduled`, `activityStarted`, `completed`, `failed`,
      `timedOut`, `timerStarted`, `timerFired`, `signaled`, `update`, `cancelRequested`,
      `canceled`, `wfTaskFailed`, `closed`.
    - Workflow-task scheduled/started/completed events are dropped; they would be noise
      on stage.
    - Built from `GetWorkflowHistory`. `Label` is the activity type or the signal or update
      name; `Worker` is parsed from the identity.
    - Uses `histKind(*historypb.HistoryEvent) (kind, label string, keep bool)`.
  - `POST /api/freeze {worker}`: `docker pause` the container, then `docker unpause` after
    `HammerDuration`. The worker view shows `Frozen bool` / `downUntil`. `SetStep`
    unpauses all workers before restarting them.

- [ ] **Step 1: Failing tests (pure functions).**
  - `TestTimeoutLabel` (three enum values).
  - `TestWorkerIDFromIdentity` (`"worker-mochi"` → 2, `"controller"` → 0).
  - `TestHistKind`: build `historypb.HistoryEvent`s for ActivityTaskScheduled(ChargeCard),
    TimerFired and WorkflowTaskCompleted. Expect `scheduled/ChargeCard/keep`,
    `timerFired/keep` and `keep=false`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Expected: PASS. Live checks:
  - `curl :18080/api/history?id=<id>` returns events.
  - Freezing a worker makes `docker ps` show it as `Paused`.
- [ ] **Step 5: Commit.** `feat(backend): observe timeouts, stuck workflow tasks, task queue pollers and history`

### Task 7: Frontend section plumbing

**Files:**
- Create: `frontend/src/lib/idioms.ts`, `frontend/src/lib/idioms.test.ts`
- Create: `frontend/src/app/idioms/[scene]/page.tsx`, `frontend/src/app/idioms/page.tsx`
  (redirects to `/idioms/1`)
- Modify:
  - `frontend/src/lib/steps.ts` (StepConfig fields, nav helpers)
  - `components/pages/SimulatorPage.tsx` (takes `config: StepConfig`)
  - `app/[step]/page.tsx`
  - `components/organisms/ScenarioMenu.tsx`, `components/pages/MenuPage.tsx`
  - `components/organisms/index.tsx` (`StepNav` for a section)
  - `styles/tokens.css` (`--c-idioms`)

**Interfaces:**
- Produces, in `StepConfig`:
  - `section: "steps" | "idioms"`
  - `rule?: string`
  - `code?: CodeSnippet`
  - `switches?: SwitchId[]`
- `type SwitchId = "idemKey" | "build"`.
- `interface CodeSnippet { lines: string[]; anchors: Partial<Record<CodeAnchor, number>> }`,
  where `CodeAnchor` is `"reserve" | "charge" | "courier" | "ship" | "email" | "cleanup" | "signal" | "update" | "query" | "late"` and the values are 0-based line indexes.
- `IDIOMS: StepConfig[]` (ids 101–108), `getScene(id)`, `routeFor(cfg): string`,
  `neighbours(cfg): {prev?: string; next?: string}`, `stepAccent` returning
  `var(--c-idioms)` for idioms.
- `SimulatorPage({ config }: { config: StepConfig })`.
- Scene content (names, rules, tools, actions, switches):

  | ID | Name | Rule | Tools | Actions / switches |
  |---|---|---|---|---|
  | 101 | Workflow vs activity | "Workflows decide. Activities do." | select, hammer | flood |
  | 102 | History & replay | "Temporal stores events, not state." | select, hammer | (none) |
  | 103 | Retryable vs not | "Failures retry by policy, unless you say they can't." | select, error, hammer | (none) |
  | 104 | Idempotency | "Activities run at least once. Make them idempotent." | select, hammer | switch idemKey |
  | 105 | Determinism | "Workflow code must replay the same way." | select, hammer | switch build |
  | 106 | Timeouts | "Each timeout catches a different failure." | select, freeze, hammer | paySlow, payDownLong |
  | 107 | Workers & task queues | "Workers poll. Temporal never pushes." | hammer | hammerAll, flood |
  | 108 | Talking to a workflow | "Signal tells, query asks, update asks and waits." | select, signal, query, update, cancel | (none) |

  - Each scene's `tryThis` gives the concrete click sequence from the spec table, e.g.
    "Select a parcel, then hammer the pet holding it…".
  - Each scene's `code` is a ≤14-line excerpt copied from `backend/internal/orders/workflow.go`
    after Task 2. Scene 105 shows both the `time.Since` and `workflow.Now` lines.

- [ ] **Step 1: Failing tests** in `idioms.test.ts`:
  - ids are 101..108 and unique;
  - every scene has `rule`, `code` and `section === "idioms"`;
  - every anchor index is within `code.lines`;
  - `routeFor(getScene(103)!) === "/idioms/3"`;
  - `neighbours(getScene(101)!).prev === undefined`;
  - `neighbours(getScene(108)!).next === undefined`.
- [ ] **Step 2: Run** `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Arrow keys use `neighbours`, digits `1`–`8` jump within the
  idioms section, and the existing step pages pass `config={getStep(id)}`. The menu renders
  an extra "Idioms" cartridge (sticker "REAL TEMPORAL · 8 SCENES") after the STEPS fan.
  `Enter` on it goes to `/idioms/1`, and the `6` key selects it.
- [ ] **Step 4: Run all frontend checks.** Expected: PASS. Then click through `/`, `/5` and
  `/idioms/1`…`/idioms/8`; the steps still behave as before.
- [ ] **Step 5: Commit.** `feat(frontend): add the idioms section with eight scenes`

### Task 8: Snapshot and view model for idiom state

**Files:**
- Modify: `frontend/src/lib/live/snapshot.ts`, `lib/live/toView.ts`, `lib/types.ts`
- Test: `frontend/src/lib/live/toView.test.ts`

**Interfaces:**
- Consumes the backend fields from Tasks 1–6:
  - `order.giftWrap`, `address`, `waitUntil`, `express`, `timeout`, `stuck`, status
    `canceled`;
  - `stats.canceled`;
  - `workers[].replayedAt` / `replayedEvents` / `frozen`;
  - `queue{pollers, backlog}`;
  - `scene{idemKey, build}`.
- Produces:
  - `DotView` gains `bow?: boolean`, `stamp?: "stuck"`, `tag?: string` (e.g. "heartbeat ⏱")
    and `fate` gains `"canceled"`. Ring gains `"stuck"`.
  - `Loc` hub `timer: true` is used for orders with `waitUntil > now`, with label = seconds left.
  - `WorkerCardView` gains `replayed?: { events: number; ago: number }`, `frozen?: boolean`
    and `polling?: boolean`.
  - `ArenaView` gains `queue?: { pollers: number[]; backlog: number }` and
    `scene?: { idemKey: boolean; build: "good" | "bad" }`.
  - ScoreKey gains `"canceled"`.

- [ ] **Step 1: Failing tests:**
  - an order with `waitUntil` in the future → hub dot with `timer: true` and label `"4s"`;
  - `stuck: "nondeterminism"` → ring `"stuck"`;
  - status `canceled` → fate `"canceled"`;
  - `charged: 2` → ring `"dup"`;
  - a worker with `replayedAt` 1 s ago → `replayed.events` set; with 9 s ago →
    `replayed` undefined (shown for 6 s).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run frontend checks.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(frontend): map idiom state from snapshots into the view`

### Task 9: Clickable parcels, new tools and the speech bubble

**Files:**
- Modify:
  - `lib/types.ts`
  - `lib/steps.ts` (`TOOL_META`)
  - `components/atoms/icons.tsx`
  - `components/atoms/Parcel.tsx`
  - `components/organisms/board/Board.tsx`
  - `components/organisms/board/nodes.tsx`
  - `components/organisms/board/ToolCursor.tsx`
  - `components/pages/SimulatorPage.tsx`
  - `lib/live/api.ts`
  - `lib/fx/effects.ts` (`nodeAnchor`)
- Create: `components/molecules/SpeechBubble.tsx`, `lib/bubble.ts`, `lib/bubble.test.ts`

**Interfaces:**
- `ToolId` adds `"select" | "error" | "signal" | "query" | "update" | "cancel" | "freeze"`.
- `NodeId` adds `` `o:${string}` ``.
- `TOOL_META` entries with keys V, E, G, Q, U, X, C.
  - The error tool has a sub-mode `"500" | "declined"`, toggled by pressing `E` again and
    shown on the tile.
- `api.order(id, op, arg?)` returns `Promise<OpReply>`; `api.scene({idemKey?, build?})`;
  `api.freeze(worker)`; `api.history(id)` returns `Promise<HistEvent[]>`.
- `lib/bubble.ts`: `type Bubble = {orderId: string; text: string; tone: Tone; at: number}`
  and `bubbleVisible(b, now): boolean` (true for 4 s).
- Parcels are rendered inside a hit group when the current tool is a parcel tool (select,
  error, signal, query, update, cancel). Otherwise `pointerEvents="none"` stays as today.
- The selected parcel gets an outline. `selected` is held in `SimulatorPage` state, and
  Esc clears the selection before navigating.
- `hit("o:<id>")` dispatches:
  - select → `setSelected(id)`;
  - error → `api.order(id,"inject",mode)`;
  - signal / query / update / cancel → `api.order(id, op)`.
  - The reply becomes the bubble, anchored at the dot's placed position.
- The freeze tool works on `w:` nodes → `api.freeze(id)`.
- The Parcel atom draws:
  - the bow (`bow`);
  - the stuck ring (red, pulsing);
  - the `tag` text;
  - the canceled look (grey, dashed).

- [ ] **Step 1: Failing test:** `bubbleVisible` is true at +3999 ms and false at +4001 ms.
  An `api.order` URL test checks the request body `{id, op, arg}` with a mocked fetch.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Frontend checks pass.** Live check on `/idioms/8`:
  - query → bubble with the real step;
  - update before shipping → green ✓, after shipping → red ✗;
  - cancel → the parcel greys out and "Release stock ↩" runs on a pet.
- [ ] **Step 5: Commit.** `feat(frontend): make parcels clickable with signal, query, update, cancel, error and freeze tools`

### Task 10: Code panel, history strip and scene switches

**Files:**
- Create:
  - `components/organisms/CodePanel.tsx`
  - `components/organisms/HistoryStrip.tsx`
  - `components/atoms/Switch.tsx`
  - `lib/code.ts` (`activeAnchor`)
  - `lib/code.test.ts`
- Modify:
  - `components/templates/ArenaTemplate.tsx` (optional `strip` slot under the board)
  - `components/organisms/index.tsx` (Toolbox renders `step.switches` and the new actions)
  - `lib/types.ts` (`ActionId` adds `"payDownLong"`)
  - `lib/steps.ts` (`ACTION_META.payDownLong = {label: "⚡ Payments down 20 s", key: "L"}`)
  - `components/pages/SimulatorPage.tsx`

**Interfaces:**
- `activeAnchor(order: SnapOrder | undefined, now: number): CodeAnchor | undefined`.
  Mapping:
  - `waitUntil > now` → `"courier"`;
  - a running compensation step → `"cleanup"`;
  - otherwise the step index → `reserve` / `charge` / `ship` / `email`;
  - `ship` becomes `"late"` in scene 105 when `express` is set.
- CodePanel shows the scene's rule (large) and the snippet, and highlights the active
  anchor line for the selected order. It replaces `OrdersPanel` on idiom scenes; the
  score moves to a compact row under it.
- HistoryStrip:
  - polls `api.history(selected)` every 700 ms while an order is selected;
  - renders chips coloured by kind (activity green, timer gold, failure red, signal/update
    blue);
  - the newest chip slides in;
  - when the selected order's worker has a fresh `replayed`, it runs a left-to-right
    sweep across the chips with "replayed by <Pet>";
  - with nothing selected it shows "Select a parcel (V) to see its history".
- Switch atom: a big two-state toggle.
  - `idemKey` → `api.scene({idemKey})`.
  - `build` → `api.scene({build})`, with the labels "workflow.Now() ✓" and "time.Now() ✗".
- Poll arrows: the Board draws an animated dashed line from each worker in
  `view.queue.pollers` to the hub, but only when `view.queue` is present on scene 107.
  The backlog number shows on the hub.

- [ ] **Step 1: Failing tests** for `activeAnchor`:
  - courier while waiting;
  - charge while step 1 is running;
  - cleanup for a running comp step;
  - late with `express` in scene 105;
  - `undefined` for no order.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Frontend checks pass.** Live checks:
  - `/idioms/2`: select, hammer → the sweep shows a real replay.
  - `/idioms/4`: flip the switch to OFF, hammer mid-charge → two red coins.
  - `/idioms/5`: deploy `time.Now()` → in-flight parcels get the red stuck ring and the
    Temporal UI shows WorkflowTaskFailed (non-deterministic). Deploying `workflow.Now()`
    recovers them.
- [ ] **Step 5: Commit.** `feat(frontend): add code panel, history strip and scene switches`

### Task 11: Effects and sounds for the idioms

**Files:**
- Modify:
  - `lib/fx/events.ts`
  - `lib/fx/effects.ts`
  - `lib/fx/particles.ts`
  - `lib/fx/sound.ts`
  - `lib/fx/fxState.ts` (if filtering is needed)
  - tests next to each

**Interfaces:**
- New `FxEvent` kinds, all derived in `diffViews`:
  - `orderCanceled` (fate becomes canceled) → poof (grey);
  - `stuck` (ring becomes stuck) → red shake + spark;
  - `replayed {worker}` (worker `replayed` appears) → a "↻" text burst over the pet;
  - `timeout {id, tag}` (dot `tag` newly set) → a gold text burst with the tag.
- A `soundFor` case for each new kind (the switch is exhaustive).

- [ ] **Step 1: Failing tests** in `events.test.ts`: one test per new event, using
  `testViews.ts` builders, asserting that the event is emitted exactly once across two
  identical follow-up views.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Frontend checks pass.**
- [ ] **Step 5: Commit.** `feat(frontend): add effects for replays, cancels, stuck tasks and timeouts`

### Task 12: Docs and end-to-end walkthrough

**Files:**
- Modify: `AGENTS.md` (route table and layout), `README.md` (route table)

- [ ] **Step 1:** Add `/idioms/1`–`/idioms/8` rows and the new endpoints and hotkeys to
  AGENTS.md and README.md.
- [ ] **Step 2:** Run `make up` and `make dev`. With Playwright, visit each `/idioms/N`, do the
  scene's tryThis sequence and screenshot the result.
  - Check that what each scene claims happens.
  - Check the Temporal UI (:18233) for one order per scene; in particular the
    non-determinism failure in scene 5 and CANCELED in scene 8.
- [ ] **Step 3:** Run both full check lines and quote the tails.
- [ ] **Step 4: Commit.** `docs: document the idioms section`
