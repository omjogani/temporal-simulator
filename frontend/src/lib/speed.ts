"use client";

import { useSyncExternalStore } from "react";

// Visualization speed shared by every step. Kept in a module store so it
// survives route changes, and in localStorage so it survives a reload.

export const SPEED_STOPS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const KEY = "sim-speed";

let speed = 1;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = Number(window.localStorage.getItem(KEY));
    if (SPEED_STOPS.includes(v as (typeof SPEED_STOPS)[number])) speed = v;
  } catch {
    // storage blocked: keep the default
  }
}

export function setSpeed(v: number) {
  speed = v;
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

/** Step to the next slower (-1) or faster (+1) stop. */
export function nudgeSpeed(dir: -1 | 1) {
  const i = SPEED_STOPS.indexOf(speed as (typeof SPEED_STOPS)[number]);
  const next = SPEED_STOPS[Math.max(0, Math.min(SPEED_STOPS.length - 1, (i < 0 ? 3 : i) + dir))];
  setSpeed(next);
}

export function useSpeed(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return speed;
    },
    () => 1,
  );
}
