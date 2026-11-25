"use client";

import { useRef, useSyncExternalStore } from "react";
import type { PlacedDot } from "../motion/useDotMotion";
import type { ArenaView, NodeId } from "../types";
import { nodeAnchor, shakeOffset, tapAt, type Effect, type XY } from "./effects";
import type { FxEvent } from "./events";
import { fxStep, newFxState, type FxState } from "./fxState";

export interface FxFrame {
  effects: Effect[];
  shake: XY;
  /** Events found since the last call to takeEvents (for sound). */
  takeEvents(): FxEvent[];
  /** The presenter clicked a node with a tool. */
  tap(node: NodeId): void;
}

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );

/**
 * Keeps the live effects for the board (see fxState.ts for what fires and what stays quiet).
 * Returns an `update` function to call during render, like useDotMotion's `place`.
 */
export function useFx() {
  const state = useRef<FxState>(newFxState());
  const reduced = useReducedMotion();

  return function update(view: ArenaView, placed: PlacedDot[], now: number, resetKey: unknown): FxFrame {
    const s = state.current;
    const hidden = typeof document !== "undefined" && document.hidden;
    fxStep(s, { view, placed, now, resetKey, hidden });
    return {
      effects: reduced ? [] : s.effects,
      shake: reduced ? { x: 0, y: 0 } : shakeOffset(s.effects, now),
      takeEvents: () => s.events.splice(0),
      tap: (node) => {
        const at = nodeAnchor(node, placed);
        if (at) s.effects.push(tapAt(at, s.now));
      },
    };
  };
}
