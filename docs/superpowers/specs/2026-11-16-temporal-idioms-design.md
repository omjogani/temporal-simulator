# Temporal idioms section: design

## Intent

Steps /2–/5 show Temporal **surviving failures**. The talk also needs to teach the
**programming model**: the rules every Temporal developer lives by.
- What a workflow is, what an activity is, and why the split exists.
- Event history and replay.
- What gets retried, and what doesn't.
- Why activities must be idempotent, and why workflows must be deterministic.
- Which timeout catches which failure.
- How workers and task queues fit together.
- How you talk to a running workflow.

This is one new **Idioms** section, reached from its own cartridge on the scenario menu. It
contains eight scenes, one per idiom.

## Goals

- **Interactive in the same way as the steps.** The presenter picks a tool, clicks
  something on the board (a parcel, a pet, the hub, a switch) and watches the board react.
  - Same arena layout, same pets, parcels and effects.
  - Same hotkeys, hammer and play/pause.
  - ←/→ moves between the eight scenes; Esc returns to the menu.
- **Real Temporal** for everything (AGENTS.md: Act 2 is never simulated). Errors,
  replays, timeouts and duplicates are produced by real workers against `temporal-sim`.
- **Rule plus code.** Each scene names its rule in one line and shows the few lines of Go
  that embody it. The highlighted line follows the order the presenter selected.
- Presentation-first: big type, few words, existing colour meanings.

## Non-goals

- Advanced features: schedules, child workflows, continue-as-new, Nexus, Worker
  Versioning, search attributes.
- Replacing /2–/5. Those stay as the failure-survival story.
- An editable code playground.

## Anti-goals

- Any effect that is not caused by real Temporal behaviour. For example, it must never
  draw a "replay" that did not happen.
- Debug-dense screens.

## Shared building blocks (new)

1. **Clickable parcels.** Parcels on the board become hit targets (`o:<orderId>`).
   - Clicking with the select tool (default cursor) **selects** an order, outlined
     and followed.
   - Other tools act on the clicked order.
2. **Code panel** (organism). The side panel shows the scene's Go snippet. While an order is
   selected, the line for its current step is highlighted: `ExecuteActivity(ChargeCard)`
   lights up while it charges.
3. **History strip** (organism). A row of event chips under the hub for the selected order,
   built from the real `GetWorkflowHistory` (WorkflowExecutionStarted,
   ActivityTaskScheduled/Started/Completed/Failed/TimedOut, TimerStarted/Fired,
   Signaled…). New events slide in live.
4. **Replay indicator.** A worker reports when it rebuilds a workflow from history: the
   workflow uses `workflow.IsReplaying` through a replay-aware hook, and the worker pushes
   an event to the controller. The strip then sweeps left to right on that pet's card:
   "Mochi replayed 9 events". This is shown only when a real replay happened.
5. **Scene switches.** Each scene has one or two large toggles (for example "Idempotency key:
   ON/OFF"). They change real behaviour by passing a different workflow input or deploying a
   different worker build. They are never cosmetic.

## The eight scenes

| # | Scene | Rule on screen | Interaction | What really happens |
|---|-------|----------------|-------------|---------------------|
| 1 | **Workflow vs activity** | "Workflows decide. Activities do." | Click a parcel. Each row on the pet's to-do list is tagged `workflow` or `activity`. Click a row to see its code. Hammer the pet mid-activity. | The activity is retried on another pet. The workflow logic is not rerun: it resumes from history. |
| 2 | **Event history & replay** | "Temporal stores events, not state." | Select a parcel and watch its history strip grow. Hammer the pet that holds it. | The next pet replays the history (the real replay indicator) and continues at the exact next step. |
| 3 | **Retryable vs non-retryable** | "Failures retry by policy unless you say they can't." | Error tool with two heads: **💥 500** (retryable) and **🚫 declined** (non-retryable). Click a parcel before it charges. | 500: real activity failures with backoff; the retry policy panel shows the attempt and the next delay. Declined: `NonRetryableErrorTypes` fails at once and compensation runs. |
| 4 | **Idempotency** | "Activities run at least once. Make them idempotent." | Switch **Idempotency key ON/OFF**. Hammer a pet mid-charge. | The activity is retried after the worker dies. ON: Payments dedups by workflow ID, so one coin. OFF: two charges, shown as two red coins. |
| 5 | **Determinism** | "Workflow code must replay the same way." | **Deploy** switch: `workflow.Now()` (good) / `time.Now()` (bad). Hammer a pet. | The bad build branches on wall-clock time. On replay, a different pet takes the other branch, which is a real **non-determinism error**: the parcel is stuck with a red ring and the workflow task retries. Deploying the good build unsticks it. |
| 6 | **Timeouts** | "Each timeout catches a different failure." | **Payments slow** (start-to-close), **Freeze a pet** with `docker pause` (heartbeat), **Payments down for a long time** (schedule-to-close). | The tripped timeout type is read from history (`ActivityTaskTimedOut.timeoutType`) and flashed on the parcel and the strip. |
| 7 | **Workers & task queues** | "Workers poll. Temporal never pushes." | Watch the poll arrows from the pets to the queue. Hammer all pets. | Pollers and backlog come from real `DescribeTaskQueue`. With no pollers the backlog grows and nothing is lost; when the pets restart it drains. |
| 8 | **Talking to a workflow** | "Signal tells, query asks, update asks and waits." | Tools 📨 signal (gift wrap), 🔍 query, ✍️ update (change address), ✂️ cancel. Click a parcel. | Signal: a bow is added and a gift-wrap step appears; no reply. Query: a speech bubble with real state, and the history strip doesn't grow. Update: ✓ before shipping, ✗ "already shipped" from the validator. Cancel: the activity stops via heartbeat, cleanup runs, and the order ends *Canceled*. |

## How it is built

### Backend
- **Scene config.** `internal/steps` gains idiom scenes. A scene picks the workflow input
  flags (idempotency key on/off, which errors to inject) and pacing. Orders keep using
  `OrderWorkflow`, extended with:
  - a `giftWrap` signal handler;
  - a `changeAddress` update with a validator that rejects once Ship is recorded;
  - cancellation handling: cleanup in `workflow.NewDisconnectedContext`;
  - an optional "courier wait" timer, used by scenes that need idle time in history.
- **Builds for determinism.** At boot the workers read the deployed build (`good` | `bad`)
  from `GET /internal/deploy`. Deploying sets the build and runs `docker restart` on
  `worker-*`. The `bad` variant is a real workflow that calls `time.Now()`. It only runs
  in scene 5.
- **Error injection.** The fake Payments API gains a per-order fault (`500` once or
  `declined`). It is set by the error tool, so the failure is a real activity error.
- **Idempotency off.** The `ChargeCard` activity omits the `Idempotency-Key` header when
  the input says so, and Payments counts the duplicate.
- **Freeze a pet.** Runs `docker pause` / `docker unpause` on one worker container.
- **New controller endpoints:**
  - `POST /api/order/{id}/{signal|query|update|cancel|inject}`, which returns the real
    reply (query result, update result or rejection);
  - `POST /api/deploy`;
  - `POST /api/freeze`;
  - `GET /api/history/{id}`, the trimmed event list.
- **Snapshot additions:**
  - `selected` order history (polled while selected);
  - task queue pollers and backlog (`DescribeTaskQueue`);
  - deployed build;
  - replay events.

### Frontend
- Routes `/idioms/[scene]` (1–8). `src/lib/idioms.ts` holds each scene's config:
  - name and rule;
  - tools and actions;
  - switches;
  - code snippet with line anchors per step;
  - tryThis text.
- The idioms pages reuse `ArenaTemplate` and its live adapter. New pieces:
  - Parcel hit targets and the select tool.
  - `CodePanel` and `HistoryStrip` organisms.
  - `SpeechBubble` and `Stamp` molecules, as SVG on the board.
  - A `Switch` atom.
  - Poll-arrow and replay-sweep visuals.
- New fx events from view diffs: `replayed`, `stampOk` / `stampRejected`, `canceled`,
  `nondeterminism`, `timeout{type}`.
- The menu gets one "Idioms" cartridge after step 5. Inside the section, ←/→ moves between
  scenes 1–8.
- Hotkeys: `1`–`8` jump to a scene, `H` hammer, `E` error tool, `G` signal, `Q` query,
  `U` update, `X` cancel, `Esc` menu, plus the existing R / Space / speed / M.

## Calls I made (for review)

- The scenes reuse the order flow rather than inventing new demo workflows, so the
  audience keeps one mental model.
- Determinism is shown with a real "bad" build deployed by restarting the workers, not a
  faked error.
- The replay indicator relies on a worker hook reporting `IsReplaying`. If that proves
  unreliable, the scene shows only what history shows (a new worker identity on the next
  workflow task) rather than inventing a replay.

## Left to the builder

Exact pacing and timer lengths, snippet trimming, icon art for the new tools, and the
layout of the code panel within the existing side panel.
