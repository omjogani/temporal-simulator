// Short-lived visual effects spawned from FxEvents, positioned in board units (the
// 1000×600 SVG viewBox). Pure data: FxCanvas draws them, useFx keeps the list.
import { CLIENTS, HUB, SIDE, WORKER } from "../geometry";
import type { PlacedDot } from "../motion/useDotMotion";
import type { NodeId } from "../types";
import type { FxEvent } from "./events";

export type EffectKind = "tap" | "impact" | "confetti" | "poof" | "coin" | "spark" | "shake";

export interface Effect {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  bornAt: number;
  ttl: number;
  /** CSS colour (usually a var(--c-…)); FxCanvas resolves it. */
  color: string;
  /** 1 = normal, 2 = the Temporal Service itself. */
  power: number;
}

/** A point in board units. (geometry.ts has its own tuple `Pt` for wire paths.) */
export interface XY {
  x: number;
  y: number;
}

export const EFFECT_TTL: Record<EffectKind, number> = {
  tap: 200,
  impact: 350,
  confetti: 700,
  poof: 600,
  coin: 600,
  spark: 500,
  shake: 300,
};

export const MAX_EFFECTS = 60;

const workerXY = (id: number): XY => ({ x: WORKER.xs[id - 1], y: WORKER.top });
const HUB_XY: XY = { x: HUB.x, y: HUB.y };

/** Where an event's effect appears: on its node, or on the order's parcel (null if it is not on screen). */
export function anchor(ev: FxEvent, placed: PlacedDot[]): XY | null {
  switch (ev.kind) {
    case "workerDown":
    case "workerUp":
      return workerXY(ev.worker);
    case "hubDown":
    case "hubUp":
      return HUB_XY;
    default: {
      const p = placed.find((d) => d.dot.id === ev.id);
      return p ? { x: p.x, y: p.y } : null;
    }
  }
}

/** Where a click on a board node shows its tap ring. */
export function nodeAnchor(node: NodeId, placed: PlacedDot[] = []): XY | null {
  if (node === "hub") return HUB_XY;
  if (node === "side") return { x: SIDE.x, y: SIDE.y };
  if (node.startsWith("w:")) return workerXY(Number(node.slice(2)));
  if (node.startsWith("c:")) {
    const c = CLIENTS[Number(node.slice(2))];
    return c ? { x: c.x, y: c.y } : null;
  }
  if (node.startsWith("o:")) {
    const p = placed.find((d) => d.dot.id === node.slice(2));
    return p ? { x: p.x, y: p.y } : null;
  }
  return null;
}

let nextId = 1;

function make(kind: EffectKind, at: XY, now: number, color: string, power = 1): Effect {
  return { id: nextId++, kind, x: at.x, y: at.y, bornAt: now, ttl: EFFECT_TTL[kind], color, power };
}

/** A tap ring where the presenter clicked. */
export function tapAt(at: XY, now: number): Effect {
  return make("tap", at, now, "#ffffff");
}

export function spawn(ev: FxEvent, at: XY, now: number): Effect[] {
  switch (ev.kind) {
    case "workerDown":
      return [make("impact", at, now, "var(--c-fault)"), make("shake", at, now, "", 1)];
    case "hubDown":
      return [make("impact", at, now, "var(--c-fault)", 2), make("shake", at, now, "", 2)];
    case "workerUp":
    case "hubUp":
      return [make("spark", at, now, "var(--c-ok)")];
    case "orderDone":
      return [make("confetti", at, now, `var(--c-client-${ev.client + 1})`)];
    case "orderLost":
      return [make("poof", at, now, "var(--c-dim)")];
    case "orderFailed":
      return [make("poof", at, now, "var(--c-fault)")];
    case "charged":
      return [make("coin", at, now, "var(--c-gold)")];
    case "duplicate":
      return [make("spark", at, now, "var(--c-fault)")];
    case "retry":
      return [make("spark", at, now, "var(--c-gold)")];
  }
}

const important = (e: Effect) => e.kind === "shake" || e.kind === "impact";

/** Drops finished effects and caps the list, keeping hits (shake, impact) and then the newest. */
export function prune(list: Effect[], now: number, max = MAX_EFFECTS): Effect[] {
  const live = list.filter((e) => now - e.bornAt < e.ttl);
  if (live.length <= max) return live;
  const keep = new Set(live.filter(important).slice(-max));
  const rest = live.filter((e) => !important(e)).sort((a, b) => b.bornAt - a.bornAt || b.id - a.id);
  for (const e of rest) {
    if (keep.size >= max) break;
    keep.add(e);
  }
  return live.filter((e) => keep.has(e));
}

/** Screen-shake offset in board units: up to 4 × power, fading out over the shake's life. */
export function shakeOffset(list: Effect[], now: number): XY {
  let x = 0;
  let y = 0;
  for (const e of list) {
    if (e.kind !== "shake") continue;
    const age = now - e.bornAt;
    if (age < 0 || age >= e.ttl) continue;
    const amp = 4 * e.power * (1 - age / e.ttl);
    x += amp * Math.sin(age * 0.09 + e.id);
    y += amp * Math.cos(age * 0.113 + e.id * 1.7);
  }
  return { x, y };
}
