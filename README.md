# Temporal Chaos Simulator

An interactive board for a lightning talk about [Temporal](https://temporal.io), inspired by
[sim.tigerbeetle.com](https://sim.tigerbeetle.com/). Clients place orders, workers run them
step by step, and the presenter breaks things: hammer a worker, hammer the Temporal server,
take the Payments API down, flood the system. The scoreboards show what survives.

| Route | Act | What it shows | Backed by |
|---|---|---|---|
| `/1` | Without Temporal | Plain in-memory queue: crashes lose orders halfway | Browser illustration |
| `/2` | Temporal | Durability: kill workers or the Temporal server for 10 s, nothing is lost | Real Temporal |
| `/3` | Temporal | Timeouts and retry policy, non-retryable errors, compensation | Real Temporal |
| `/4` | Temporal | Task queue priority and fairness | Real Temporal |
| `/5` | Temporal | Pause and resume workflows | Real Temporal |

## Run it

Requirements: Docker, Go 1.24+, Node 20+ with pnpm.

```bash
make up     # Temporal + 4 worker containers in Docker: gRPC :17233, Web UI http://localhost:18233
make dev    # Go controller on :18080 (drives the workers) + Next.js on :13000
```

Open <http://localhost:13000/1>. Use ← → to move between steps.

Every step loads paused: press **▶ Play** (or Space) to start the clients placing orders, and
again to pause them (orders in flight finish). The **Speed** slider (or `-` / `+`) changes how fast orders move, from 0.25× to 2×: dot travel,
client pace and activity time. On `/2`–`/5` the controller does this for real by scaling activity
durations, client pace, the start-to-close timeout and the slow-Payments delay for new orders.
Outages always run in real seconds: the 10 s hammer and the retry
backoff (1→2→4→8 s).

## How it works

```
Browser (Next.js) ──WebSocket──▶ Go controller ──docker kill/start──▶ 4 worker containers
      ▲                              │  │                              │
      └──── snapshot 10×/s ──────────┘  └─ docker kill/start ─▶ Temporal (Docker)
                                         fake Payments API ◀── Charge card activity
```

- **Workers** are four Docker containers (`worker-biscuit`, `worker-mochi`, `worker-pepper`,
  `worker-noodle`) running the Temporal Go SDK, one activity at a time. The hammer is a real
  `docker kill`, so you can watch the container exit in Docker Desktop; it starts again after 10 s.
- **Hammering Temporal** runs `docker kill` on the `temporal-sim` container and starts it again
  10 s later. Workflow history lives in Postgres (`temporal-sim-postgres`), which keeps
  running, so nothing is lost.
- **Ticks on the worker to-do lists come from Temporal**: the workflow publishes its progress
  as a memo after each recorded activity, and the controller reads it back.
- **Payments** is a fake API in the controller with outage and slow switches. It dedups on the
  workflow ID used as an idempotency key, which is why retries never charge twice.
- **Priority and fairness** use real task queue `PriorityKey` and `FairnessKey` values, which the
  server turns on in `temporal/dynamicconfig.yaml`.

## Layout

```
docker-compose.yml   Postgres, Temporal server + Web UI, 4 worker containers
temporal/            Temporal dynamic config (priority + fairness)
backend/             Go: workflow, activities, worker, controller (see backend/internal)
frontend/            Next.js, atomic design (see frontend/README.md)
AGENTS.md            Notes for coding agents: ports, conventions, honesty rules
```
