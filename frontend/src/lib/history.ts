import type { HistEvent } from "./live/api";

export type ChipTone = "ok" | "gold" | "bad" | "blue" | "dim";

const TONES: Record<string, ChipTone> = {
  scheduled: "ok",
  activityStarted: "ok",
  completed: "ok",
  timerStarted: "gold",
  timerFired: "gold",
  failed: "bad",
  timedOut: "bad",
  wfTaskFailed: "bad",
  canceled: "bad",
  signaled: "blue",
  update: "blue",
  cancelRequested: "blue",
};

export const chipTone = (kind: string): ChipTone => TONES[kind] ?? "dim";

const TEXT: Record<string, string> = {
  started: "Started",
  scheduled: "Scheduled",
  activityStarted: "Running",
  completed: "Done",
  failed: "Failed",
  timedOut: "Timed out",
  timerStarted: "Timer",
  timerFired: "Fired",
  signaled: "Signal",
  update: "Update",
  cancelRequested: "Cancel asked",
  canceled: "Canceled",
  wfTaskFailed: "Task failed",
  closed: "Closed",
};

/** Short chip text: the event's own label (activity, signal or update name) when it has one. */
export const chipText = (e: HistEvent): string => (e.label && e.kind !== "started" ? e.label : (TEXT[e.kind] ?? e.kind));

export interface HistState {
  id: string | null;
  events: HistEvent[];
  /** Newest event id before the latest poll; chips past it slide in (nothing slides on the first load). */
  base: number;
}

/** Folds a poll result into the state; a failed poll (null) keeps what is on screen. */
export function nextHistory(prev: HistState, orderId: string, list: HistEvent[] | null): HistState {
  if (!list) return prev;
  const had = prev.id === orderId && prev.events.length > 0;
  return { id: orderId, events: list, base: had ? prev.events[prev.events.length - 1].id : 0 };
}
