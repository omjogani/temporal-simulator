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
| `/1` | Without Temporal | Plain queue (in-memory, auto-ack): orders lost | In-browser illustration |
| `/2` | Without Temporal | Hardened queue (durable, acks, retries, DLQ): duplicates, restarts from step 1 | In-browser illustration |
| `/3` | Temporal | Durability: kill workers / kill Temporal for 10 s, nothing lost | **Real Temporal** |
| `/4` | Temporal | Timeouts and retry policy, non-retryable errors, compensation | **Real Temporal** |
| `/5` | Temporal | Task queue priority and fairness | **Real Temporal** |
| `/6` | Temporal | Pause and resume workflows | **Real Temporal** |

Rule: anything shown in Act 2 must be real Temporal behaviour, not simulated. Act 1 is allowed
to be a pure illustration.

Design prototype (single HTML page that the app is built from):
https://claude.ai/artifact/EbTRza5nYMYpqSusyyocBe

## Layout

```
docker-compose.yml        Temporal dev server (SQLite on a volume, priority + fairness enabled)
backend/                  Go module (single binary `sim`)
  cmd/sim/                entrypoint: `sim controller` and `sim worker --id N`
  internal/orders/        workflow, activities, shared types (task queue "orders")
  internal/steps/         per-step config for the live steps (3-6)
  internal/controller/    HTTP + WebSocket API, worker process manager, docker hammer,
                          fake Payments API, client load generator, state registry
frontend/                 Next.js (App Router, TypeScript), atomic design
  src/components/atoms|molecules|organisms|templates
  src/app/[step]/         one route per step
  src/lib/                step configs, board geometry, Act 1 simulation, live adapter
```

## How the live steps work

- `sim controller` (port 18080) spawns 4 real worker processes (`sim worker --id 1..4`).
  Hammering a worker is a real SIGKILL; it is restarted after 10 s.
- Hammering Temporal runs `docker kill temporal-sim`, then `docker start temporal-sim` after 10 s.
  History survives because the dev server uses a SQLite file on a named volume.
- Each worker runs one activity at a time (`MaxConcurrentActivityExecutionSize: 1`) so a
  worker card shows exactly one order. Activities heartbeat so a killed worker is detected fast.
- Ticks on the worker to-do list come from Temporal: the workflow upserts a `progress` memo
  after each recorded activity and the controller polls `ListWorkflowExecutions`.
  Workers also push `started` / `finished` events to the controller for live progress.
- The controller hosts a fake Payments API with fault switches (down = 500s, slow = 5 s,
  declined card = 402 non-retryable). It dedups by idempotency key (the workflow ID).
- The browser gets one state snapshot about 10 times a second over `ws://localhost:18080/ws`.

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

Only ever hammer / kill the `temporal-sim` container.

## Commands

```bash
make up          # Temporal in Docker (:17233, UI :18233)
make dev         # controller (:18080, spawns 4 workers) + Next.js (:13000)
open http://localhost:13000/1
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
cd frontend && pnpm lint && pnpm build
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
- **Presentation-first UI:** the screen is projected during a talk. Keep side panels minimal,
  numbers large, colours meaningful (gold = charged / retrying, red = lost / duplicate,
  green = done). Don't add dense debug info to the main view.
- **Backend:** standard library HTTP, `go.temporal.io/sdk`, `github.com/coder/websocket`.
  Keep workflow code deterministic; all I/O goes in activities.
- **Honesty:** if the UI claims something about Temporal, it must match real Temporal
  semantics (at-least-once activities, retries handed to any healthy worker, etc.).
