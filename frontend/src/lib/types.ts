// View model shared by the Act 1 simulation and the live (Temporal) adapter.
// Components only ever see these types, never where the data came from.

export type Tone = "neutral" | "good" | "bad" | "gold" | "dim";

export type ToolId = "hammer" | "pause";
export type ActionId =
  | "flood"
  | "bulk"
  | "hammerAll"
  | "declined"
  | "payDown"
  | "paySlow"
  | "pauseAll"
  | "resumeAll"
  | "recap"
  | "reset";
export type SchedMode = "fifo" | "priority" | "fair";
export type NodeId = "hub" | "side" | `w:${number}` | `c:${number}`;
export type ScoreKey = "done" | "inflight" | "lost" | "dup" | "dlq" | "failed" | "paused";

export type RowState =
  | "placeholder"
  | "pending"
  | "running"
  | "reporting"
  | "done"
  | "backoff"
  | "interrupted"
  | "failed"
  | "skipped";

export interface ChecklistRowView {
  label: string;
  state: RowState;
  progress?: number; // 0..1 while running
  meta?: string;
  metaTone?: Tone;
  comp?: boolean; // compensation step
}

export interface WorkerCardView {
  id: number; // 1-based
  up: boolean;
  downLeftMs: number;
  status: string;
  statusTone: Tone;
  orderLabel?: string;
  orderTone?: Tone;
  ghost: boolean; // showing the order it was running when it died
  rows: ChecklistRowView[];
  footer: string;
}

export type Loc =
  | { kind: "client"; client: number; slot: number }
  | { kind: "hub"; slot: number; lane?: number; timer?: boolean }
  | { kind: "worker"; worker: number }
  | { kind: "side"; slot: number }
  | { kind: "gone" };

export type Ring = "none" | "charged" | "dup" | "ghost" | "done" | "failed" | "retry";

export interface DotView {
  id: string;
  client: number; // 0-based
  loc: Loc;
  ring: Ring;
  fate?: "done" | "lost" | "failed";
  declined?: boolean;
  ghost?: boolean;
  hidden?: boolean;
  label?: string; // small text next to the dot (e.g. retry countdown)
}

export interface HubView {
  label: string;
  up: boolean;
  downLeftMs: number;
  starting: boolean;
  info: string;
  more?: string;
  lanes: boolean;
  /** Where the hub keeps its state: plain queue in RAM, queue on disk, or Temporal history. */
  store: "memory" | "disk" | "history";
}

export interface PaymentsView {
  state: "ok" | "down" | "slow";
  leftMs: number;
}

export interface ShelfChip {
  id: string;
  label: string;
  client: number;
}

export interface SideView {
  kind: "dlq" | "paused";
  count: number;
  chips: ShelfChip[];
}

export interface ScoreItemView {
  key: ScoreKey;
  label: string;
  value: number;
  tone: Tone;
  note?: string;
}

export interface WorkerRowView {
  id: number;
  up: boolean;
  note: string;
  noteTone: Tone;
  completed: number;
}

export interface LaneView {
  client: number;
  label: string;
  ms: number;
  done: number;
}

export interface RetryPolicyView {
  startToClose: string;
  backoff: string;
  maxAttempts: string;
  nonRetryable: string;
}

export interface PanelsView {
  workers: WorkerRowView[];
  service: { label: string; up: boolean; note: string };
  retry?: RetryPolicyView;
  lanes?: LaneView[];
  score: ScoreItemView[];
}

export interface ArenaView {
  hub: HubView;
  payments: PaymentsView;
  side: SideView | null;
  workers: WorkerCardView[];
  dots: DotView[];
  panels: PanelsView;
  banner: { seq: number; text: string };
  connected: boolean;
  sched: SchedMode;
  temporalUi?: string;
}

export interface ArenaControls {
  hit(node: NodeId, tool: ToolId): void;
  action(a: ActionId): void;
  resume(orderId: string): void;
  setSched(m: SchedMode): void;
}
