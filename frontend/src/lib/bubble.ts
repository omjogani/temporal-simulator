import type { Tone } from "./types";

/** The real reply to the presenter's click on a parcel, shown for a few seconds. */
export type Bubble = { orderId: string; text: string; tone: Tone; at: number };

export const BUBBLE_MS = 4000;

export const bubbleVisible = (b: Bubble, now: number): boolean => now - b.at < BUBBLE_MS;
