// The effects state machine behind useFx, kept pure so it can be tested.
//
// Besides diffing views it decides which changes deserve feedback:
// - A node going down gets an impact only when it was hammered (it shows a countdown).
//   Restarts (Reset and step changes restart every worker container) and containers stopped
//   outside the simulator go down with no countdown and stay quiet, and so does their return.
// - While the tab is hidden nothing spawns, so coming back from the Temporal UI or Docker
//   Desktop does not release a burst of stale effects.
import type { PlacedDot } from "../motion/useDotMotion";
import type { ArenaView } from "../types";
import { anchor, prune, spawn, type Effect } from "./effects";
import { diffViews, type FxEvent } from "./events";

export interface FxState {
  prev: ArenaView | null;
  resetKey: unknown;
  effects: Effect[];
  /** Events not yet taken (for sound). */
  events: FxEvent[];
  now: number;
  /** Workers that went down from a hammer and have not come back yet. */
  hammered: Set<number>;
  hubHammered: boolean;
}

export const newFxState = (): FxState => ({ prev: null, resetKey: undefined, effects: [], events: [], now: 0, hammered: new Set(), hubHammered: false });

export interface FxInput {
  view: ArenaView;
  placed: PlacedDot[];
  now: number;
  /** A change (Reset, new Act 1 sim, live data arriving) starts over without effects. */
  resetKey: unknown;
  /** document.hidden: track state, spawn nothing. */
  hidden: boolean;
}

/** Keeps only the events worth feedback, updating the hammer bookkeeping. */
function worthIt(s: FxState, ev: FxEvent, view: ArenaView): boolean {
  switch (ev.kind) {
    case "workerDown": {
      const w = view.workers.find((x) => x.id === ev.worker);
      if (!w || w.downLeftMs <= 0) return false;
      s.hammered.add(ev.worker);
      return true;
    }
    case "workerUp":
      return s.hammered.delete(ev.worker);
    case "hubDown":
      if (view.hub.downLeftMs <= 0) return false;
      s.hubHammered = true;
      return true;
    case "hubUp": {
      const was = s.hubHammered;
      s.hubHammered = false;
      return was;
    }
    default:
      return true;
  }
}

/** Advances the state by one rendered frame (mutates `s`). */
export function fxStep(s: FxState, { view, placed, now, resetKey, hidden }: FxInput): void {
  if (resetKey !== s.resetKey) {
    s.resetKey = resetKey;
    s.prev = null;
    s.effects = [];
    s.hammered.clear();
    s.hubHammered = false;
  }
  s.now = now;
  if (view !== s.prev) {
    const events = diffViews(s.prev, view);
    s.prev = view;
    for (const ev of events) {
      if (!worthIt(s, ev, view) || hidden) continue;
      const at = anchor(ev, placed);
      if (at) s.effects.push(...spawn(ev, at, now));
      s.events.push(ev);
    }
  }
  s.effects = prune(s.effects, now);
}
