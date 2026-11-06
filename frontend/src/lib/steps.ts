import type { ActionId, ScoreKey, ToolId } from "./types";

export interface StepConfig {
  id: number;
  act: 1 | 2;
  name: string;
  live: boolean; // backed by real Temporal through the Go controller
  hub: string;
  side: "dlq" | "paused" | null;
  lanes: boolean;
  tools: ToolId[];
  actions: (ActionId | "sched")[];
  score: ScoreKey[];
  tryThis: string;
}

export const STEPS: StepConfig[] = [
  {
    id: 1,
    act: 1,
    name: "Plain queue",
    live: false,
    hub: "Message queue",
    side: null,
    lanes: false,
    tools: ["hammer"],
    actions: ["flood"],
    score: ["done", "inflight", "lost"],
    tryThis:
      "Hammer a busy worker. The queue deleted that order when it handed it out, so it dies halfway: stock reserved, card charged, never shipped. Then hammer the queue: every waiting order is gone, and new orders fail for 10 s.",
  },
  {
    id: 2,
    act: 1,
    name: "Hardened queue",
    live: false,
    hub: "Message queue",
    side: "dlq",
    lanes: false,
    tools: ["hammer"],
    actions: ["flood", "payDown", "recap"],
    score: ["done", "inflight", "lost", "dup", "dlq"],
    tryThis:
      "Hammer a worker after ✓ Charge card. 3 s later the order is redelivered and starts over at step 1, so the card is charged twice. Take Payments down: orders retry straight away, restart each time, and end up in dead letters. Open Recap at the end.",
  },
  {
    id: 3,
    act: 2,
    name: "Durability",
    live: true,
    hub: "Temporal Service",
    side: null,
    lanes: false,
    tools: ["hammer"],
    actions: ["flood", "hammerAll"],
    score: ["done", "inflight", "lost", "dup"],
    tryThis:
      "Hammer a worker mid-order: its ticks are kept and Temporal retries the step on a healthy worker. Hammer all workers, or hammer the Temporal Service itself, for 10 s. Everything waits, then continues. Lost stays at 0.",
  },
  {
    id: 4,
    act: 2,
    name: "Timeouts & retries",
    live: true,
    hub: "Temporal Service",
    side: null,
    lanes: false,
    tools: ["hammer"],
    actions: ["payDown", "paySlow", "declined"],
    score: ["done", "inflight", "lost", "dup", "failed"],
    tryThis:
      "Take Payments down for 10 s: Charge card retries after 1, 2, 4 and 8 s, with the retry timer held by Temporal, then succeeds once Payments is back. Make Payments slow: calls take 5 s, hit the 3 s timeout and retry. Send a declined card: it's non-retryable, so the order fails fast and releases its stock.",
  },
  {
    id: 5,
    act: 2,
    name: "Priority & fairness",
    live: true,
    hub: "Temporal Service",
    side: null,
    lanes: true,
    tools: ["hammer"],
    actions: ["bulk", "sched"],
    score: ["done", "inflight", "lost"],
    tryThis:
      "Pick a mode first, then send a bulk import from Client 4. FIFO: everyone waits behind it. Priority: Client 1 (VIP) jumps ahead. Fairness: every client gets its turn. Modes apply to orders placed after you switch.",
  },
  {
    id: 6,
    act: 2,
    name: "Pause & resume",
    live: true,
    hub: "Temporal Service",
    side: "paused",
    lanes: false,
    tools: ["pause", "hammer"],
    actions: ["pauseAll", "resumeAll", "flood"],
    score: ["done", "inflight", "paused", "lost"],
    tryThis:
      "Pick Pause and click a busy worker. Its order stops before its next step and waits on the shelf with its ticks. Hammer the Temporal Service while it's paused. Click the paused order to resume it from where it stopped.",
  },
];

export const getStep = (id: number): StepConfig | undefined => STEPS.find((s) => s.id === id);

export const TOOL_META: Record<ToolId, { label: string; key: string }> = {
  hammer: { label: "🔨 Hammer", key: "H" },
  pause: { label: "⏸ Pause workflow", key: "P" },
};

export const ACTION_META: Record<ActionId, { label: string; key?: string }> = {
  flood: { label: "Flood ×30", key: "F" },
  bulk: { label: "Bulk import ×40", key: "F" },
  hammerAll: { label: "Hammer all workers", key: "A" },
  declined: { label: "Declined card", key: "D" },
  payDown: { label: "⚡ Payments down", key: "Z" },
  paySlow: { label: "🐌 Payments slow", key: "S" },
  pauseAll: { label: "Pause all" },
  resumeAll: { label: "Resume all" },
  recap: { label: "Recap" },
  reset: { label: "Reset", key: "R" },
};

export const SCORE_META: Record<ScoreKey, { label: string; tone: "good" | "bad" | "gold" | "neutral" }> = {
  done: { label: "Completed", tone: "good" },
  inflight: { label: "In flight", tone: "neutral" },
  lost: { label: "Lost", tone: "bad" },
  dup: { label: "Duplicate charges", tone: "bad" },
  dlq: { label: "Dead letters", tone: "bad" },
  failed: { label: "Failed cleanly", tone: "gold" },
  paused: { label: "Paused", tone: "gold" },
};

/** Worker pet names (index = worker id - 1). Must match backend/internal/orders WorkerNames. */
export const WORKER_NAMES = ["Biscuit", "Mochi", "Pepper", "Noodle"];
export const workerName = (id: number) => WORKER_NAMES[id - 1] ?? `Worker ${id}`;
/** Docker container a live worker runs in, as shown in Docker Desktop. */
export const workerContainer = (id: number) => `worker-${workerName(id).toLowerCase()}`;

export const STEP_NAMES = ["Reserve stock", "Charge card", "Ship order", "Send email"];
export const COMP_NAME = "Release stock ↩";
export const CLIENT_COLORS = ["#e5645c", "#5fb865", "#5ea2f0", "#d6a531"];
export const HAMMER_MS = 10_000;
