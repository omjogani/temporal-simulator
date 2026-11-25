# Plain Queue Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Act 1 plain-queue simulation (`/1`) so each of steps 2-5 fixes a problem the audience has just seen break.

**Architecture:** All new behaviour lives in `QueueSim` (`frontend/src/lib/sim/engine.ts`), exposed through new `ActionId`s that the non-live branch of `action()` in `SimulatorPage.tsx` routes to engine methods. Step 1's config in `lib/steps.ts` lists the new actions and counters. Engine behaviour is tested with vitest by ticking a seeded `QueueSim` (no clock, no network).

**Tech Stack:** TypeScript, Next.js (App Router), vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-11-25-plain-queue-contrast-design.md`

## Global Constraints

- Act 1 stays an in-browser illustration; nothing in Act 2 (`/2`-`/5`) or `/idioms/*` changes behaviour. Live steps' `tryThis`, actions and keys are untouched.
- Plain-queue semantics must be honest: auto-ack loses in-flight work; ack-after-processing is at-least-once and can duplicate.
- Presentation-first UI: no dense debug info; red = lost/duplicate, gold = charged/retrying, green = done.
- Do not touch `docs/superpowers/*game-ui*`.
- Checks before every commit: `cd frontend && pnpm test && pnpm lint` (full `pnpm build` at the end). Commits: Conventional Commits, scope `frontend`, one per task. If `pnpm` fails with a corepack `pnpm.cjs` error, see "Environment note" at the end.

## Review Focus

- Hammering a worker while the Payments `slow` fault is active: the order must still be lost (or redelivered) once, never counted twice.
- Hub crash in ack-after mode: the in-memory queue, including redelivered orders, is still wiped (Lost rises); only worker crashes redeliver.
- Declined card in ack-after mode must not redeliver forever (no poison-message loop): the order is lost, Failed +1, no compensation, in both modes.
- Reset (`newSim()`) clears faults, ack mode, paused state and counters.
- Pause-all then Hammer, Flood or Bulk: no crash, no order stuck in "running" on a paused worker, queue just grows.

---

### Task 1: Engine test harness and Payments faults

**Files:**
- Create: `frontend/src/lib/sim/engine.test.ts`
- Modify: `frontend/src/lib/sim/engine.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/steps.ts` (step 1), `frontend/src/components/organisms/SimulatorPage.tsx` (non-live `action()` branch and `onKey` gating already uses `has(a)`)

**Interfaces:**
- Produces: `QueueSim.payments(mode: "down" | "slow" | "declined"): void` (starts a 10 s fault window, `HAMMER_MS`-style constant `PAY_MS = 10_000`); `view().payments` reports `{state, leftMs}` using the existing `PaymentsView` type (read `lib/types.ts` for the state names and map `down`/`slow`/`declined` to them); `view().panels.score` supports `failed`. Test helper `runFor(sim: QueueSim, ms: number, step = 16): void` defined in `engine.test.ts`, reused by later tasks.
- Behaviour: during `down` an order reaching the Charge step is lost (auto-ack, no refund), `failed++`, `lost++`, banner "Payments API down: the order was dropped, nothing refunds or retries it". `declined`: same with banner naming the declined card. `slow`: the Charge step takes 5 s instead of `ACT_MS`.

- [ ] **Step 1: Write failing tests** in `engine.test.ts` (`describe("payments faults")`): `down` window loses an order that reaches Charge and shows `failed === 1` and `lost === 1`; `declined` does the same with a different banner; `slow` makes a lone order take at least 5 s in Charge but still complete (`done === 1`); a fault expires after 10 s so a later order completes.
- [ ] **Step 2:** Run `cd frontend && pnpm vitest run src/lib/sim/engine.test.ts`. Expected: FAIL (`payments` is not a function).
- [ ] **Step 3:** Implement `payments()` and the fault handling in `QueueSim.tick`; set `view().payments` from it; add `failed` to the `values` record in `view()`.
- [ ] **Step 4:** Add actions `payDown`, `paySlow`, `declined` and score `failed` to step 1 in `lib/steps.ts` (existing `ActionId`s, keys Z/S/D); in `SimulatorPage.tsx` non-live `action()` route those three to `sim.payments(...)`. Existing Toolbox `payActive`/`actionLabel` already render the countdown from `view.payments`.
- [ ] **Step 5:** Run `pnpm test && pnpm lint`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(frontend): add payments faults to the plain queue`.

### Task 2: Ack mode toggle with redelivery and Dup counter

**Files:**
- Modify: `frontend/src/lib/sim/engine.ts`, `frontend/src/lib/types.ts` (new `ActionId` `"ackMode"`), `frontend/src/lib/steps.ts` (`ACTION_META` entry, step 1 actions), `frontend/src/components/organisms/SimulatorPage.tsx`, `frontend/src/components/organisms/index.tsx` (pressed state for the toggle)
- Test: `frontend/src/lib/sim/engine.test.ts`

**Interfaces:**
- Consumes: `runFor` from Task 1.
- Produces: `QueueSim.toggleAckMode(): void`; `QueueSim.ackMode: "auto" | "after"` (public readonly, default `"auto"`); `view().panels.score` includes the `dup` item only while `ackMode === "after"`, regardless of `cfg.score`. `ACTION_META.ackMode = { label: "Ack after processing", key: "K" }`.
- Behaviour: in `"after"` mode, hammering a worker puts its in-hand order back at the front of the queue instead of losing it; an order whose `charged` flag was already true that completes its Charge step again increments `dup` and gets a "charged twice" banner. Hub crash still wipes the queue (in memory) in both modes.

- [ ] **Step 1: Write failing tests** (`describe("ack mode")`): auto mode loses the in-hand order on worker hammer (existing behaviour, regression); after mode requeues it, it completes (`done === 1`, `lost === 0`); an already-charged order hammered after Charge ends with `dup === 1`; `dup` appears in the score list only in after mode; hub hammer in after mode loses every queued order including a redelivered one.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement the mode, redelivery in the worker-hammer path (`engine.ts` hit handler) and the dynamic score list in `view()`.
- [ ] **Step 4:** Wire the action: add `"ackMode"` to `ActionId`, `ACTION_META`, step 1 `actions`; route in non-live `action()` to `sim.toggleAckMode()`; in the Toolbox show it pressed when `view` reports after mode (add `ackMode` to the pressed derivation using `sim.ackMode` passed through `ArenaView`, or a small prop; choose whichever existing prop path `payActive` uses).
- [ ] **Step 5:** `pnpm test && pnpm lint`. Expected: pass.
- [ ] **Step 6: Commit** `feat(frontend): add ack-after-processing mode with duplicate charges`.

### Task 3: Bulk job and VIP starvation

**Files:**
- Modify: `frontend/src/lib/sim/engine.ts`, `frontend/src/lib/types.ts` (`ActionId` `"bulkJob"`), `frontend/src/lib/steps.ts`, `frontend/src/components/organisms/SimulatorPage.tsx`
- Test: `frontend/src/lib/sim/engine.test.ts`

**Interfaces:**
- Consumes: `runFor`.
- Produces: `QueueSim.bulkJob(): void` (enqueues 40 orders from client index 3 at once, tagged bulk); orders from client index 0 are VIP and rendered with `tag: "VIP"` on their `DotView` (check `DotView.tag` type in `lib/types.ts`). `ACTION_META.bulkJob = { label: "Bulk job ×40", key: "B" }`.
- Behaviour: queue stays FIFO. When a VIP order is picked up by a worker, if it waited more than 5 s the banner reads "VIP order waited Ns behind the bulk job" (N rounded).

- [ ] **Step 1: Write failing tests** (`describe("bulk job")`): `bulkJob()` adds 40 queued orders; a VIP order spawned after `bulkJob()` is picked up only after all 40 earlier orders have been picked up (FIFO) and the banner mentions the wait; VIP `DotView`s carry the tag.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `bulkJob`, the VIP tag in `view()` and the wait banner.
- [ ] **Step 4:** Add `"bulkJob"` to `ActionId`/`ACTION_META`/step 1 actions; add key `b` in the `onKey` handler gated by `has("bulkJob")`; route in non-live `action()`.
- [ ] **Step 5:** `pnpm test && pnpm lint`. Expected: pass.
- [ ] **Step 6: Commit** `feat(frontend): add bulk job and VIP starvation to the plain queue`.

### Task 4: Pause-all (no resume)

**Files:**
- Modify: `frontend/src/lib/sim/engine.ts`, `frontend/src/lib/steps.ts` (step 1 actions), `frontend/src/components/organisms/SimulatorPage.tsx`
- Test: `frontend/src/lib/sim/engine.test.ts`

**Interfaces:**
- Consumes: `runFor`, `ackMode`.
- Produces: `QueueSim.pauseAll(): void`. Uses the existing `pauseAll` `ActionId` (no hotkey, rendered by the generic Toolbox loop). Do not add `resumeAll` to step 1.
- Behaviour: a plain queue cannot pause an order mid-flight, so stopping the consumers kills them: all workers go down until Reset, in-hand orders are lost (auto-ack) or sent back to the queue (after mode), banner "A queue can't pause an order mid-flight: stopping the workers dropped it" (auto) or "...sent it back to the queue" (after). The queue then only grows.

- [ ] **Step 1: Write failing tests** (`describe("pause all")`): after `pauseAll()` no worker takes new orders over 30 s while `queue` length grows; in auto mode each in-hand order is lost, in after mode none is lost; Flood and Hammer after pause do not throw and leave no order in `"running"`.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `pauseAll` (workers `downUntil = Infinity`) and verify the tick loop and `view()` handle `Infinity` (worker card shows down, no countdown NaN).
- [ ] **Step 4:** Add `"pauseAll"` to step 1 `actions`; route in non-live `action()`.
- [ ] **Step 5:** `pnpm test && pnpm lint`. Expected: pass.
- [ ] **Step 6: Commit** `feat(frontend): add pause-all to the plain queue`.

### Task 5: Presenter fixes (numbered captions, autoplay)

**Files:**
- Modify: `frontend/src/lib/steps.ts` (`StepConfig.tryThis: string | string[]`, add exported `tryThisLines(step: StepConfig): string[]`, step 1 caption as numbered beats), `frontend/src/components/organisms/index.tsx` (`TryThis` renders `string[]` as an ordered list), `frontend/src/components/organisms/ScenarioMenu.tsx:117` (use `tryThisLines(step).join(" ")`), `frontend/src/components/organisms/SimulatorPage.tsx` (`newSim()` calls `setRunning(true)` so Act 1 starts playing; Reset also)
- Test: `frontend/src/lib/steps.test.ts` (create if absent, else append)

**Interfaces:**
- Produces: `tryThisLines(step: StepConfig): string[]` returns `[step.tryThis]` for a string and the array as is otherwise. Live steps' captions stay strings and render exactly as before.
- Step 1 beats, in order: hammer a worker (Lost climbs, banner names the step it died in); ack-after mode (nothing lost, but a Dup appears); Payments down or declined (orders vanish, nothing refunds); Bulk job (VIP waits behind it); Pause all (a queue can't pause mid-order). Wording is yours; keep each under about 12 words.

- [ ] **Step 1: Write failing tests**: `tryThisLines` wraps a string into one line and returns arrays unchanged; step 1's `tryThisLines(...).length >= 4`.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/steps.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the type change, helper, `TryThis` list rendering (CSS Module, tokens only) and `ScenarioMenu` update.
- [ ] **Step 4:** Make Act 1 sims autoplay in `newSim()`; confirm a fresh `/1` shows orders flowing without pressing Space.
- [ ] **Step 5:** `pnpm test && pnpm lint && pnpm build`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(frontend): number the step 1 beats and autoplay Act 1`.

### Task 6: Browser pass and docs

**Files:**
- Modify: `AGENTS.md` (step 1 row/notes: new actions and keys Z S D K B, pause-all; keep the layout section accurate)

- [ ] **Step 1:** Run the app (`make dev`; see Environment note), open `http://localhost:13000/1`, and walk the five beats from Task 5 once each. Expected: each beat produces the banner and counter described above; Reset returns to a clean board; `/2`-`/5` look unchanged.
- [ ] **Step 2:** Update AGENTS.md; run `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 3: Commit** `docs: document the extended plain queue step`.

## Environment note

On this machine corepack 0.34 cannot launch pnpm 12.3.4. Use a shim on PATH for the session: a script running `node ~/.cache/node/corepack/v1/pnpm/12.3.4/bin/pnpm.mjs "$@"` (one already exists at the session scratchpad `bin/pnpm`), or update corepack globally.
