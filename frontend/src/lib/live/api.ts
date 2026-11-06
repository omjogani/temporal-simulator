// Thin client for the Go controller.

export const CONTROLLER_URL = process.env.NEXT_PUBLIC_CONTROLLER_URL ?? "http://localhost:18080";
export const WS_URL = CONTROLLER_URL.replace(/^http/, "ws") + "/ws";

async function post(path: string, body: unknown = {}) {
  try {
    await fetch(CONTROLLER_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // The connection notice already tells the presenter the backend is unreachable.
  }
}

export const api = {
  step: (step: number, force = false) => post("/api/step", { step, force }),
  hammerWorker: (worker: number) => post("/api/hammer", { target: "worker", worker }),
  hammerWorkers: () => post("/api/hammer", { target: "workers" }),
  hammerTemporal: () => post("/api/hammer", { target: "temporal" }),
  payments: (mode: "down" | "slow") => post("/api/payments", { mode }),
  load: (kind: "flood" | "bulk" | "declined") => post("/api/load", { kind }),
  sched: (mode: "fifo" | "priority" | "fair") => post("/api/sched", { mode }),
  speed: (speed: number) => post("/api/speed", { speed }),
  run: (run: boolean) => post("/api/run", { run }),
  pause: (id = "") => post("/api/pause", { id }),
  resume: (id = "") => post("/api/resume", { id }),
};
