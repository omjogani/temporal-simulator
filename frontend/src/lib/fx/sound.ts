"use client";

// Optional sound effects, synthesised with Web Audio (no audio files). Muted by default:
// the talk has a microphone. The choice is kept in localStorage.
import { useEffect, useSyncExternalStore } from "react";
import type { FxEvent } from "./events";

export type SoundName = "thud" | "ding" | "buzz" | "coin" | "pop";

export function soundFor(ev: FxEvent): SoundName | null {
  switch (ev.kind) {
    case "workerDown":
    case "hubDown":
      return "thud";
    case "workerUp":
    case "hubUp":
      return "pop";
    case "orderDone":
      return "ding";
    case "orderLost":
    case "orderFailed":
    case "duplicate":
      return "buzz";
    case "charged":
      return "coin";
    case "retry":
      return null;
  }
}

/** True if `name` may play now (and records it); false within `gapMs` of its last play. */
export function throttle(last: Partial<Record<SoundName, number>>, name: SoundName, now: number, gapMs = 80): boolean {
  const prev = last[name];
  if (prev !== undefined && now - prev < gapMs) return false;
  last[name] = now;
  return true;
}

// ---- mute store ----

const KEY = "sim-sound";
let muted = true;
let loaded = false;
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed: Partial<Record<SoundName, number>> = {};

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(KEY) !== "on";
  } catch {
    // storage blocked: stay muted
  }
}

function ensureAudio() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function setMuted(m: boolean) {
  muted = m;
  if (!m) ensureAudio(); // called from a key press or click: a user gesture
  try {
    if (m) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "on");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

// ---- synth ----

type Note = { type: OscillatorType; from: number; to?: number; at: number; dur: number };

const NOTES: Record<SoundName, Note[]> = {
  thud: [{ type: "sine", from: 90, to: 40, at: 0, dur: 0.12 }],
  ding: [
    { type: "triangle", from: 880, at: 0, dur: 0.06 },
    { type: "triangle", from: 1320, at: 0.06, dur: 0.06 },
  ],
  buzz: [{ type: "sawtooth", from: 110, at: 0, dur: 0.14 }],
  coin: [
    { type: "square", from: 988, at: 0, dur: 0.05 },
    { type: "square", from: 1319, at: 0.05, dur: 0.05 },
  ],
  pop: [{ type: "sine", from: 440, to: 660, at: 0, dur: 0.07 }],
};

function synth(name: SoundName) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  for (const n of NOTES[name]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const start = t0 + n.at;
    const end = start + n.dur;
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.from, start);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(1, start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** Sound was left on (localStorage): browsers only start audio after a gesture, so start it on the first one. */
function useAudioOnFirstGesture() {
  useEffect(() => {
    const start = () => {
      load();
      if (!muted) ensureAudio();
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);
}

export function useSound() {
  useAudioOnFirstGesture();
  const isMuted = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return muted;
    },
    () => true,
  );
  return {
    muted: isMuted,
    toggle: () => setMuted(!muted),
    play(events: FxEvent[], now: number) {
      if (muted || !ctx) return;
      for (const ev of events) {
        const name = soundFor(ev);
        if (name && throttle(lastPlayed, name, now)) synth(name);
      }
    },
  };
}
