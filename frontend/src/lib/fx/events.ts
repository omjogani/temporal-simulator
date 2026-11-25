// Turns two consecutive arena views into the things that just happened.
// Works the same for the Act 1 simulation and live Temporal snapshots, because both
// produce ArenaViews; the backend sends no extra event fields.
import type { ArenaView, DotView } from "../types";

export type OrderFx =
  | "orderDone" | "orderLost" | "orderFailed" | "orderCanceled" | "charged" | "duplicate" | "retry" | "stuck";
export type FxEvent =
  | { kind: "workerDown" | "workerUp" | "replayed"; worker: number }
  | { kind: "timeout"; id: string; client: number; tag: string }
  | { kind: "hubDown" | "hubUp" }
  | { kind: OrderFx; id: string; client: number };

const FATE_EVENT: Record<NonNullable<DotView["fate"]>, OrderFx> = {
  done: "orderDone",
  lost: "orderLost",
  failed: "orderFailed",
  canceled: "orderCanceled",
};

const RING_EVENT: Partial<Record<DotView["ring"], OrderFx>> = {
  charged: "charged",
  dup: "duplicate",
  retry: "retry",
  stuck: "stuck",
};

const quiet = (d: DotView) => d.hidden || d.ghost;

/**
 * Events between `prev` and `next`. Nothing is emitted for the first view (a page load or
 * reconnect shows existing state, it did not just happen) or for dots first seen in `next`.
 */
export function diffViews(prev: ArenaView | null, next: ArenaView): FxEvent[] {
  if (!prev) return [];
  const out: FxEvent[] = [];

  const before = new Map(prev.workers.map((w) => [w.id, w.up]));
  for (const w of next.workers) {
    const was = before.get(w.id);
    if (was === undefined || was === w.up) continue;
    out.push({ kind: w.up ? "workerUp" : "workerDown", worker: w.id });
  }

  const wasReplayed = new Map(prev.workers.map((w) => [w.id, !!w.replayed]));
  for (const w of next.workers) {
    if (w.replayed && wasReplayed.get(w.id) === false) out.push({ kind: "replayed", worker: w.id });
  }

  if (prev.hub.up !== next.hub.up) out.push({ kind: next.hub.up ? "hubUp" : "hubDown" });

  const old = new Map(prev.dots.map((d) => [d.id, d]));
  for (const d of next.dots) {
    const p = old.get(d.id);
    if (!p || quiet(d) || quiet(p)) continue;
    const fateFx = d.fate && FATE_EVENT[d.fate];
    if (fateFx && !p.fate) out.push({ kind: fateFx, id: d.id, client: d.client });
    const ring = RING_EVENT[d.ring];
    if (ring && d.ring !== p.ring) out.push({ kind: ring, id: d.id, client: d.client });
    if (d.tag && !p.tag) out.push({ kind: "timeout", id: d.id, client: d.client, tag: d.tag });
  }
  return out;
}
