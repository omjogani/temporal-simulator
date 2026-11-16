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
