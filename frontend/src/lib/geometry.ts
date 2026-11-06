// Fixed board geometry (SVG viewBox 1000 × 600) and wire paths.
import type { Loc } from "./types";

export const VIEW = { w: 1000, h: 600 };
export const HUB = { x: 500, y: 180, w: 360, h: 112 };
/** Inside the hub: a one-row task queue (head on the right) and a row for retry timers. */
export const HUB_IN = {
  cells: 14,
  cell: 24,
  queueY: HUB.y - HUB.h / 2 + 58,
  timerY: HUB.y - HUB.h / 2 + 92,
  timers: 5,
  laneY0: HUB.y - HUB.h / 2 + 42,
  laneH: 19,
  laneCells: 13,
};
/** Centre x of queue cell k, counted from the head (k = 0 is next to be picked up). */
export const queueCellX = (k: number): number => HUB.x + HUB.w / 2 - 14 - HUB_IN.cell / 2 - k * HUB_IN.cell;
export const SIDE = { x: 120, y: 180, w: 170, h: 100 };
export const CLIENTS = [200, 400, 600, 800].map((x, i) => ({ x, y: 36, i }));
export const WORKER = { top: 320, w: 214, h: 255, xs: [130, 377, 623, 870], bend: [270, 292, 292, 270] };

export type Pt = [number, number];
export interface Path {
  pts: Pt[];
  segs: { x0: number; y0: number; x1: number; y1: number; l: number; s: number }[];
  len: number;
}

/** Corner radius of every wire bend, in viewBox units. */
export const BEND_R = 26;

/**
 * Replace each sharp corner with a sampled quadratic curve so wires (and the dots
 * travelling on them) bend smoothly. The radius shrinks to fit short segments.
 */
export function smooth(input: Pt[], r = BEND_R): Pt[] {
  const pts = input.filter((p, i) => i === 0 || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) > 0.5);
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [px, py] = pts[i];
    const [bx, by] = pts[i + 1];
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const cross = (ax - px) * (by - py) - (ay - py) * (bx - px);
    if (Math.abs(cross) < 1e-6 * la * lb) continue; // straight through
    const k = Math.min(r, la / 2, lb / 2);
    const s: Pt = [px + ((ax - px) / la) * k, py + ((ay - py) / la) * k];
    const e: Pt = [px + ((bx - px) / lb) * k, py + ((by - py) / lb) * k];
    const n = 10;
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * px + t * t * e[0], u * u * s[1] + 2 * u * t * py + t * t * e[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function mkPath(raw: Pt[]): Path {
  const pts = smooth(raw);
  const segs: Path["segs"] = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    segs.push({ x0, y0, x1, y1, l, s: len });
    len += l;
  }
  return { pts, segs, len: Math.max(len, 1) };
}

export function pointAt(p: Path, f: number): Pt {
  const d = Math.max(0, Math.min(1, f)) * p.len;
  for (let k = 0; k < p.segs.length; k++) {
    const s = p.segs[k];
    if (d <= s.s + s.l || k === p.segs.length - 1) {
      const q = s.l ? Math.min(1, (d - s.s) / s.l) : 0;
      return [s.x0 + (s.x1 - s.x0) * q, s.y0 + (s.y1 - s.y0) * q];
    }
  }
  return p.pts[0];
}

const rev = (pts: Pt[]): Pt[] => pts.slice().reverse();

/** Wire from client i down to the hub's top edge. */
export const clientWire = (i: number): Pt[] => {
  const c = CLIENTS[i];
  const hx = HUB.x - 120 + i * 80;
  return [
    [c.x, c.y + 18],
    [c.x, 95],
    [hx, 95],
    [hx, HUB.y - HUB.h / 2],
  ];
};

/** Wire from the hub's bottom edge to worker j's card (j is 1-based). */
export const workerWire = (j: number): Pt[] => {
  const k = j - 1;
  const sx = HUB.x - 120 + k * 80;
  const x = WORKER.xs[k];
  const by = WORKER.bend[k];
  return [
    [sx, HUB.y + HUB.h / 2],
    [sx, by],
    [x, by],
    [x, WORKER.top],
  ];
};

export const sideWire = (): Pt[] => [
  [HUB.x - HUB.w / 2, HUB.y],
  [SIDE.x + SIDE.w / 2, HUB.y],
];

/** Resting position of a dot for a location. */
export function slotPoint(loc: Loc): Pt | null {
  switch (loc.kind) {
    case "client": {
      const c = CLIENTS[loc.client];
      return [c.x - 45 + (loc.slot % 10) * 10, c.y + 30 + Math.floor(loc.slot / 10) * 10];
    }
    case "hub": {
      if (loc.lane !== undefined) {
        const k = Math.min(loc.slot, HUB_IN.laneCells - 1);
        return [queueCellX(k), HUB_IN.laneY0 + loc.lane * HUB_IN.laneH];
      }
      if (loc.timer) {
        const k = Math.min(loc.slot, HUB_IN.timers - 1);
        return [HUB.x - HUB.w / 2 + 78 + k * HUB_IN.cell, HUB_IN.timerY];
      }
      return [queueCellX(Math.min(loc.slot, HUB_IN.cells - 1)), HUB_IN.queueY];
    }
    case "worker":
      return [WORKER.xs[loc.worker - 1] - WORKER.w / 2 + 20, WORKER.top + 54];
    case "side": {
      const k = Math.min(loc.slot, 15);
      return [SIDE.x - SIDE.w / 2 + 18 + (k % 8) * 19, SIDE.y - 2 + Math.floor(k / 8) * 20];
    }
    case "gone":
      return null;
  }
}

/** Route a dot takes when it moves between two kinds of location. */
export function routeBetween(from: Loc, to: Loc): Pt[] {
  const end = slotPoint(to);
  const tail: Pt[] = end ? [end] : [];
  if (from.kind === "client" && to.kind === "hub") return [...clientWire(from.client), ...tail];
  if (from.kind === "client" && to.kind === "worker") return [...clientWire(from.client), ...workerWire(to.worker), ...tail];
  if (from.kind === "hub" && to.kind === "worker") return [...workerWire(to.worker), ...tail];
  if (from.kind === "worker" && to.kind === "hub") return [...rev(workerWire(from.worker)), ...tail];
  if (from.kind === "worker" && to.kind === "worker" && from.worker !== to.worker)
    return [...rev(workerWire(from.worker)), ...workerWire(to.worker), ...tail];
  if (from.kind === "worker" && to.kind === "side") return [...rev(workerWire(from.worker)), ...sideWire(), ...tail];
  if (from.kind === "hub" && to.kind === "side") return [...sideWire(), ...tail];
  if (from.kind === "side" && to.kind === "hub") return [...rev(sideWire()), ...tail];
  if (from.kind === "side" && to.kind === "worker") return [...rev(sideWire()), ...workerWire(to.worker), ...tail];
  if (from.kind === "hub" && to.kind === "client") return [...rev(clientWire(to.client)), ...tail];
  return tail;
}

export const locKey = (l: Loc): string => {
  switch (l.kind) {
    case "client":
      return `c${l.client}`;
    case "hub":
      return "h";
    case "worker":
      return `w${l.worker}`;
    case "side":
      return "s";
    case "gone":
      return "g";
  }
};
