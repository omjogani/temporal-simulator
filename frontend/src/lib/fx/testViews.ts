// Test helpers: minimal ArenaViews for the effects engine tests.
import type { ArenaView, DotView, WorkerCardView } from "../types";

export const worker = (id: number, up = true): WorkerCardView => ({
  id,
  up,
  downLeftMs: up ? 0 : 9000,
  status: up ? "idle" : "down",
  statusTone: up ? "dim" : "bad",
  ghost: false,
  rows: [],
  footer: "",
});

export const dot = (id: string, extra: Partial<DotView> = {}): DotView => ({
  id,
  client: 0,
  loc: { kind: "hub", slot: 0 },
  ring: "none",
  ...extra,
});

export function view({ hubUp = true, down = [] as number[], dots = [] as DotView[] } = {}): ArenaView {
  return {
    hub: { label: "Temporal Service", up: hubUp, downLeftMs: 0, starting: false, info: "", lanes: false, store: "history" },
    payments: { state: "ok", leftMs: 0 },
    side: null,
    workers: [1, 2, 3, 4].map((id) => worker(id, !down.includes(id))),
    dots,
    panels: { workers: [], service: { label: "", up: hubUp, note: "" }, score: [] },
    banner: { seq: 0, text: "" },
    connected: true,
    sched: "fifo",
  };
}
