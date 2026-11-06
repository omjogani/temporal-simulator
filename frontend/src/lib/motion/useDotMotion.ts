"use client";

import { useRef } from "react";
import { clientWire, locKey, mkPath, pointAt, routeBetween, slotPoint, type Path } from "../geometry";
import type { DotView, Loc } from "../types";

const SPEED = 0.9; // px per ms along a wire
// In Temporal every activity goes back through the server between steps, often
// for only a few ms. A dot waits this long on its worker before travelling back
// to the hub, so quick handoffs don't turn into constant back-and-forth.
const LINGER_MS = 450;

interface Motion {
  x: number;
  y: number;
  key: string;
  loc: Loc;
  path?: Path;
  t0: number;
  dur: number;
  fadeT0?: number;
  pendingKey?: string;
  pendingSince?: number;
}

export interface PlacedDot {
  dot: DotView;
  x: number;
  y: number;
  opacity: number;
}

/**
 * Turns logical dot locations into on-screen positions. When a dot's location
 * changes it travels along the wires (client → hub → worker …) instead of
 * jumping, so both the simulation and the live 10 Hz snapshots look continuous.
 */
export function useDotMotion() {
  const store = useRef(new Map<string, Motion>());
  const last = useRef(0);

  return (dots: DotView[], now: number): PlacedDot[] => {
    const dt = last.current ? Math.min(64, now - last.current) : 16;
    last.current = now;
    const map = store.current;
    const seen = new Set<string>();
    const out: PlacedDot[] = [];

    for (const dot of dots) {
      seen.add(dot.id);
      const key = locKey(dot.loc);
      let m = map.get(dot.id);
      if (!m) {
        // New dots enter from their client tile.
        const [sx, sy] = clientWire(dot.client)[0];
        m = { x: sx, y: sy, key: "new", loc: { kind: "client", client: dot.client, slot: 0 }, t0: now, dur: 0 };
        map.set(dot.id, m);
      }
      let travel = m.key !== key && dot.loc.kind !== "gone";
      if (travel && m.loc.kind === "worker" && dot.loc.kind === "hub" && !m.path) {
        if (m.pendingKey !== key) {
          m.pendingKey = key;
          m.pendingSince = now;
        }
        travel = now - (m.pendingSince ?? now) >= LINGER_MS;
      } else if (m.key === key) {
        m.pendingKey = undefined;
      }
      const lingering = m.key !== key && !travel && dot.loc.kind !== "gone";
      if (travel) {
        m.pendingKey = undefined;
        const route = routeBetween(m.loc, dot.loc);
        const path = mkPath([[m.x, m.y], ...route]);
        m.path = path;
        m.t0 = now;
        m.dur = Math.max(200, Math.min(1000, path.len / SPEED));
        m.key = key;
        m.loc = dot.loc;
      } else if (lingering) {
        // stay on the worker for now
      } else if (m.key !== key) {
        m.key = key;
        m.loc = dot.loc;
      } else {
        m.loc = dot.loc; // same place, maybe a different slot
      }

      if (m.path) {
        const f = (now - m.t0) / m.dur;
        [m.x, m.y] = pointAt(m.path, f);
        if (f >= 1) m.path = undefined;
      } else if (!lingering) {
        const target = slotPoint(dot.loc);
        if (target) {
          const k = Math.min(1, dt * 0.012);
          m.x += (target[0] - m.x) * k;
          m.y += (target[1] - m.y) * k;
        }
      }

      let opacity = dot.hidden ? 0 : 1;
      if (dot.fate) {
        if (m.fadeT0 === undefined) m.fadeT0 = now;
        const age = now - m.fadeT0;
        opacity *= Math.max(0, 1 - age / (dot.fate === "lost" ? 1100 : 800));
        if (dot.fate === "lost") m.y += dt * 0.06;
      }
      out.push({ dot, x: m.x, y: m.y, opacity });
    }
    for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
    return out;
  };
}
