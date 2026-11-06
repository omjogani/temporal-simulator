// Fixed board geometry (SVG viewBox 1000 × 600) and wire paths.
import type { Loc } from "./types";

export const VIEW = { w: 1000, h: 600 };
export const HUB = { x: 500, y: 175, w: 320, h: 100 };
export const PAY = { x: 880, y: 175, w: 170, h: 70 };
export const SIDE = { x: 120, y: 175, w: 170, h: 100 };
export const CLIENTS = [200, 400, 600, 800].map((x, i) => ({ x, y: 36, i }));
export const WORKER = { top: 320, w: 214, h: 255, xs: [130, 377, 623, 870], bend: [270, 292, 292, 270] };

export type Pt = [number, number];
export interface Path {
  pts: Pt[];
  segs: { x0: number; y0: number; x1: number; y1: number; l: number; s: number }[];
  len: number;
}

export function mkPath(pts: Pt[]): Path {
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
        const k = Math.min(loc.slot, 12);
        return [HUB.x - HUB.w / 2 + 46 + k * 19, HUB.y - HUB.h / 2 + 36 + loc.lane * 17];
      }
      const k = Math.min(loc.slot, 41);
      return [HUB.x - HUB.w / 2 + 22 + (k % 14) * 20, HUB.y + 2 + Math.floor(k / 14) * 20];
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
