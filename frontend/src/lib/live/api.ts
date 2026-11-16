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

export type OpId = "signal" | "query" | "update" | "cancel" | "inject";
export interface OpReply {
  ok: boolean;
  text: string;
  tone: "good" | "bad" | "gold" | "dim";
}
export interface HistEvent {
  id: number;
  kind: string;
  label: string;
  worker: number;
  t: number;
}

const UNREACHABLE: OpReply = { ok: false, text: "Controller unreachable, try again", tone: "gold" };

async function order(id: string, op: OpId, arg = ""): Promise<OpReply> {
  try {
    const res = await fetch(CONTROLLER_URL + "/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, op, arg }),
    });
    return (await res.json()) as OpReply;
  } catch {
    return UNREACHABLE;
  }
}

async function history(id: string): Promise<HistEvent[]> {
  try {
    const res = await fetch(`${CONTROLLER_URL}/api/history?id=${encodeURIComponent(id)}`);
    return (await res.json()) as HistEvent[];
  } catch {
    return [];
  }
}

export const api = {
  order,
  history,
  scene: (s: { idemKey?: boolean; build?: string }) => post("/api/scene", s),
  freeze: (worker: number) => post("/api/freeze", { worker }),
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
