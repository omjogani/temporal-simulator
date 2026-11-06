# Temporal Chaos Simulator

An interactive board for a lightning talk about [Temporal](https://temporal.io), inspired by
[sim.tigerbeetle.com](https://sim.tigerbeetle.com/). Clients place orders, workers run them
step by step, and the presenter breaks things: hammer a worker, hammer the Temporal server,
take the Payments API down, flood the system. The scoreboards show what survives.

| Route | Act | What it shows | Backed by |
|---|---|---|---|
| `/1` | Without Temporal | Plain in-memory queue: crashes lose orders halfway | Browser illustration |
| `/2` | Without Temporal | Hardened queue: redelivery restarts from step 1 and charges twice; dead letters | Browser illustration |
| `/3` | Temporal | Durability: kill workers or the Temporal server for 10 s, nothing is lost | Real Temporal |
| `/4` | Temporal | Timeouts and retry policy, non-retryable errors, compensation | Real Temporal |
| `/5` | Temporal | Task queue priority and fairness | Real Temporal |
| `/6` | Temporal | Pause and resume workflows | Real Temporal |

## Run it

Requirements: Docker, Go 1.24+, Node 20+ with pnpm.

```bash
make up     # Temporal dev server in Docker: gRPC :17233, Web UI http://localhost:18233
make dev    # Go controller on :18080 (spawns 4 workers) + Next.js on :13000
```

Open <http://localhost:13000/1>. Use ← → to move between steps.

## How it works

```
Browser (Next.js) ──WebSocket──▶ Go controller ──spawns/kills──▶ 4 worker processes
      ▲                              │  │                              │
      └──── snapshot 10×/s ──────────┘  └─ docker kill/start ─▶ Temporal (Docker)
                                         fake Payments API ◀── Charge card activity
```

- **Workers** are real OS processes running the Temporal Go SDK, one activity at a time.
  The hammer is a real `SIGKILL`; they come back after 10 s.
- **Hammering Temporal** runs `docker kill` on the `temporal-sim` container and starts it again
  10 s later. History survives because the dev server stores it in SQLite on a volume.
- **Ticks on the worker to-do lists come from Temporal**: the workflow publishes its progress
  as a memo after each recorded activity, and the controller reads it back.
- **Payments** is a fake API in the controller with outage and slow switches. It dedups on the
  workflow ID used as an idempotency key, which is why retries never charge twice.
- **Priority and fairness** use real task queue `PriorityKey` and `FairnessKey` values, which the
  dev server has turned on in `docker-compose.yml`.

## Layout

```
docker-compose.yml   Temporal dev server
backend/             Go: workflow, activities, worker, controller (see backend/internal)
frontend/            Next.js, atomic design (see frontend/README.md)
AGENTS.md            Notes for coding agents: ports, conventions, honesty rules
```
