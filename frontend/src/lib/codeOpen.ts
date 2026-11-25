"use client";

import { useSyncExternalStore } from "react";

// Whether the idioms code drawer is open. Closed by default so the board keeps its space.
// Kept in a module store (survives scene changes) and in localStorage (survives a reload).

const KEY = "sim-code-open";

let open = false;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    open = window.localStorage.getItem(KEY) === "1";
  } catch {
    // storage blocked: keep the default
  }
}

export function setCodeOpen(v: boolean) {
  open = v;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function toggleCodeOpen() {
  load();
  setCodeOpen(!open);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCodeOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return open;
    },
    () => false,
  );
}
