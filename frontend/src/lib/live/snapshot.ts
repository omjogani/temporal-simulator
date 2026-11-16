// Mirrors backend/internal/controller/state.go (JSON over the WebSocket).

export type StepState = "pending" | "running" | "reporting" | "done" | "backoff" | "interrupted" | "failed" | "skipped";
export type OrderStatus =
  | "holding"
  | "queued"
  | "running"
  | "backoff"
  | "interrupted"
  | "finishing"
  | "paused"
  | "completed"
  | "failed"
  | "lost"
  | "canceled";

export interface SnapStep {
  state: StepState;
  attempt: number;
  startedAt?: number;
  durationMs?: number;
  nextRetryAt?: number;
  error?: string;
  worker: number;
}

export interface SnapOrder {
  id: string;
  num: number;
  client: number;
  declined: boolean;
  status: OrderStatus;
  worker: number;
  steps: SnapStep[];
  current: number;
  charged: number;
  pauseRequested: boolean;
  endedAt?: number;
  giftWrap: boolean;
  address: string;
  /** Unix ms the workflow sleeps until; 0 when it is not sleeping. */
  waitUntil: number;
  express: boolean;
  timeout: "" | "start-to-close" | "heartbeat" | "schedule-to-close";
  stuck: "" | "nondeterminism";
}

export interface Snapshot {
  now: number;
  step: number;
  live: boolean;
  temporal: { up: boolean; downUntil: number };
  workers: {
    id: number;
    up: boolean;
    downUntil: number;
    frozen: boolean;
    completed: number;
    replayedAt: number;
    replayedEvents: number;
  }[];
  payments: { downUntil: number; slowUntil: number; charges: number; deduped: number; failures: number };
  orders: SnapOrder[];
  stats: { done: number; failed: number; lost: number; canceled: number; duplicates: number; inflight: number; paused: number };
  sched: "fifo" | "priority" | "fair";
  waits: number[];
  clientDone: number[];
  banner: { seq: number; text: string };
  retry: { initialMs: number; coefficient: number; maxMs: number; maxAttempts: number };
  startToCloseMs: number;
  speed: number;
  running: boolean;
  temporalUi: string;
  scene: { idemKey: boolean; build: "good" | "bad" };
  queue: { pollers: number[]; backlog: number };
}
