// The four workers are pets. Their pose is derived only from the worker card, so it is
// exactly as true as the card: a knocked-out pet means "this container was killed".
import type { WorkerCardView } from "./types";

export type Species = "dog" | "cat" | "rabbit" | "fox";
export type PetPose = "idle" | "working" | "ko" | "waking";

/** Worker id (1-based) → species and fur colour. Names live in steps.ts (Biscuit, Mochi, Pepper, Noodle). */
export const PETS: Record<number, { species: Species; color: string }> = {
  1: { species: "dog", color: "#d9a066" },
  2: { species: "cat", color: "#efe6d5" },
  3: { species: "rabbit", color: "#9aa3ad" },
  4: { species: "fox", color: "#e8823a" },
};

/** How long before coming back a knocked-out pet starts shaking itself awake. */
export const WAKING_MS = 1500;

export function petPose(card: Pick<WorkerCardView, "up" | "downLeftMs" | "orderLabel">): PetPose {
  // Waking only in the last moments of a hammer's countdown; with no countdown (stopped
  // in Docker Desktop, or restarting) the pet stays knocked out until it is really back.
  if (!card.up) return card.downLeftMs > 0 && card.downLeftMs <= WAKING_MS ? "waking" : "ko";
  return card.orderLabel ? "working" : "idle";
}
