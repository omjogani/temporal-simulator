# AGENTS.md

Guide for AI coding agents (and humans) working in this repo.

## What this is

An interactive simulator for a lightning talk about **Temporal** (temporal.io), inspired by
[sim.tigerbeetle.com](https://sim.tigerbeetle.com/). The audience watches orders flow from
clients, through a hub, to workers, while the presenter breaks things (hammer a worker,
hammer the Temporal server, take the Payments API down) and the counters show what survives.

The talk has two acts, one URL per step:

| Route | Act | Topic | Backed by |
|---|---|---|---|
| `/` | | Scenario menu: one cartridge per step | |
| `/1` | Without Temporal | Plain queue (in-memory, auto-ack): orders lost | In-browser illustration |
| `/2` | Temporal | Durability: kill workers / kill Temporal for 10 s, nothing lost | **Real Temporal** |
| `/3` | Temporal | Timeouts and retry policy, non-retryable errors, compensation | **Real Temporal** |
| `/4` | Temporal | Task queue priority and fairness | **Real Temporal** |
| `/5` | Temporal | Pause and resume workflows | **Real Temporal** |
| `/idioms` | Idioms | Section intro: eight scenes on the programming model | |
| `/idioms/1` | Idioms | Workflow vs activity: workflows decide, activities do | **Real Temporal** |
| `/idioms/2` | Idioms | Event history and replay (real replay events from workers) | **Real Temporal** |
| `/idioms/3` | Idioms | Retryable (500) vs non-retryable (declined) errors, compensation | **Real Temporal** |
| `/idioms/4` | Idioms | Idempotency key on/off: a retried charge after a kill | **Real Temporal** |
| `/idioms/5` | Idioms | Determinism: deploy a `time.Now()` build, real non-determinism error | **Real Temporal** |
| `/idioms/6` | Idioms | Timeouts: start-to-close, heartbeat (`docker pause`), schedule-to-close | **Real Temporal** |
| `/idioms/7` | Idioms | Workers poll task queues: pollers and backlog from `DescribeTaskQueue` | **Real Temporal** |
| `/idioms/8` | Idioms | Signal, query, update, cancel on a running order | **Real Temporal** |

Rule: anything shown in Act 2 or the Idioms section must be real Temporal behaviour, not simulated. Act 1 is allowed
to be a pure illustration.

Design prototype (single HTML page that the app is built from):
https://claude.ai/artifact/EbTRza5nYMYpqSusyyocBe

## Layout

```
docker-compose.yml        Postgres + Temporal server (temporalio/server) + Web UI + 4 worker
                          containers; one-shot services set up the schema and `default` namespace
temporal/dynamicconfig.yaml  priority + fairness switches for the server
backend/                  Go module (single binary `sim`)
  cmd/sim/                entrypoint: `sim controller` and `sim worker --id N`
  internal/orders/        workflow, activities, shared types (task queue "orders")
  internal/steps/         per-step config for the live steps (2-5) and idiom scenes (101-108)
  internal/controller/    HTTP + WebSocket API, worker container manager, docker hammer,
                          fake Payments API, client load generator, state registry
frontend/                 Next.js (App Router, TypeScript), atomic design
  src/components/atoms|molecules|organisms|templates
  src/app/[step]/         one route per step
  src/app/idioms/[scene]/ one route per idiom scene (1-8); `src/app/idioms/` is the section intro
  src/lib/                step configs, board geometry, Act 1 simulation, live adapter;
                          `idioms.ts` holds scene configs (rule, tools, switches, code, tryThis)
  src/lib/fx/             effects from diffing ArenaViews (events, effects, particles), sound
  src/lib/pets.ts         the four worker pets and their poses
```

## How the live steps work

- The 4 workers run in Docker as `worker-biscuit`, `worker-mochi`, `worker-pepper` and
  `worker-noodle` (pet names: Biscuit, Mochi, Pepper, Noodle; same `sim worker` binary, image
  built from `backend/Dockerfile`). `sim controller` (port 18080, on the host) hammers a worker
  with `docker kill` and runs `docker start` after 10 s, so the presenter can show it in Docker
  Desktop. It also polls `docker inspect`, so stopping a worker in Docker Desktop shows on the board.
  Workers reach the controller at `host.docker.internal:18080`. Names live in
  `backend/internal/orders/types.go` and `frontend/src/lib/steps.ts`; keep them in sync.
- Hammering Temporal runs `docker kill temporal-sim`, then `docker start temporal-sim` after 10 s.
  History survives because it lives in Postgres (`temporal-sim-postgres`, volume
  `postgres-data`), which the hammer never touches. The schema is created/updated by the
  one-shot `temporal-schema` service (admin-tools) on every `docker compose up`.
- Each worker runs one activity at a time (`MaxConcurrentActivityExecutionSize: 1`) so a
  worker card shows exactly one order. Activities heartbeat so a killed worker is detected fast.
- Ticks on the worker to-do list come from Temporal: the workflow upserts a `progress` memo
  after each recorded activity and the controller polls `ListWorkflowExecutions`.
  Workers also push `started` / `finished` events to the controller for live progress.
- The controller hosts a fake Payments API with fault switches (down = 500s, slow = 5 s,
  declined card = 402 non-retryable). It dedups by idempotency key (the workflow ID).
- The browser gets one state snapshot about 10 times a second over `ws://localhost:18080/ws`.

## How the idioms scenes work

- Scenes run as controller steps 101-108 (`/idioms/N` sets step `100+N`) on the same
  `OrderWorkflow`, extended with a `giftWrap` signal, a `changeAddress` update (validator
  rejects once Ship is recorded), cancellation cleanup and an optional courier-wait timer.
- Workers report real replays (`workflow.IsReplaying`) to the controller; the board shows a
  replay sweep only when one happened.
- Determinism (scene 5): workers read the deployed build (`good` | `bad`) from
  `GET /internal/deploy` at boot; deploying restarts `worker-*`. The `bad` build calls
  `time.Now()` on purpose and is the only non-deterministic workflow code allowed.
- Endpoints added for the idioms:
  - `POST /api/scene` `{idemKey?, build?}`: idempotency-key switch and build deploy.
  - `POST /api/order` `{id, op, arg}`, op = `signal` | `query` | `update` | `cancel` |
    `inject` (arg `500` or `declined`): returns the real reply `{ok, text, tone}`.
  - `POST /api/freeze` `{worker}`: `docker pause` one worker (heartbeat timeout), then unpause.
  - `GET /api/history?id=<workflowId>`: trimmed event history for the history strip.
  - `POST /api/payments` also takes `downLong` (500s for 20 s, schedule-to-close).
- The snapshot also carries task queue pollers and backlog, the deployed build, replay
  events, timeouts and stuck workflow tasks.

## Ports and the other local Temporal

This machine also runs **other projects**: a separate Temporal setup (containers `temporal` on
`7233` and `temporal-ui` on `8233`) and Node apps on `8080` and `3000`.
**Do not stop, restart or reuse them.** This project uses offset ports:

| Service | Port |
|---|---|
| Temporal gRPC (`temporal-sim` container) | `17233` |
| Temporal Web UI | `18233` |
| Go controller (HTTP + WS) | `18080` |
| Next.js dev server | `13000` |

Only ever hammer / kill the `temporal-sim` and `worker-*` containers from this compose file.

## Commands

```bash
make up          # Temporal in Docker (:17233, UI :18233)
make dev         # controller (:18080, spawns 4 workers) + Next.js (:13000)
open http://localhost:13000/
```

Or by hand:

```bash
docker compose up -d
cd backend && go run ./cmd/sim controller
cd frontend && pnpm install && pnpm dev
```

Checks before committing:

```bash
cd backend && go vet ./... && go build ./...
cd frontend && pnpm test && pnpm lint && pnpm build
```

## Conventions

- **Commits:** small, incremental, [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `refactor:`, `docs:`, `build:`, `chore:`, `test:`, with an optional scope,
  e.g. `feat(backend): add worker process manager`, `feat(frontend): add worker card organism`.
  Imperative, lower-case subject, no trailing period. Work on `main` and push to `origin main`.
- **Frontend:** atomic design. Atoms have no domain knowledge (Button, Kbd, StatusDot,
  BigNumber). Molecules combine atoms (ToolButton, WorkerRow, ChecklistRow). Organisms are
  board and panel sections (WorkerCard, Board, Toolbox, StepRail). Templates lay out a page
  (ArenaTemplate). Pages in `src/app` only wire data into a template.
  CSS Modules plus design tokens in `src/styles/tokens.css`. No new UI libraries without a reason.
  Board art is inline SVG atoms animated with CSS (pets, parcels, belts, kiosks). Particles
  (impacts, confetti, coins, sparks, dust) are drawn by one PixiJS canvas over the board
  (`FxCanvas`). Effects come from diffing consecutive `ArenaView`s (`src/lib/fx/events.ts`),
  never from extra backend fields. Keys: ← → steps, `Esc` menu, `H` `P` tools, `F` `A` `Z` `S`
  `D` actions, `R` reset, `-` `+` speed, Space play/pause, `M` sound (muted by default).
  In idioms scenes: `1`-`8` jump to a scene, tools `V` select, `H` hammer, `E` error, `G` signal,
  `Q` query, `U` update, `X` cancel, `C` freeze, and `L` payments down 20 s.
- **Presentation-first UI:** the screen is projected during a talk. Keep side panels minimal,
  numbers large, colours meaningful (gold = charged / retrying, red = lost / duplicate,
  green = done). Don't add dense debug info to the main view.
- **Backend:** standard library HTTP, `go.temporal.io/sdk`, `github.com/coder/websocket`.
  Keep workflow code deterministic (except the deliberate `bad` build of idioms scene 5);
  all I/O goes in activities.
- **Honesty:** if the UI claims something about Temporal, it must match real Temporal
  semantics (at-least-once activities, retries handed to any healthy worker, etc.).
