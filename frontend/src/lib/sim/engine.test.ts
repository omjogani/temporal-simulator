import { describe, expect, test } from "vitest";
import { QueueSim } from "./engine";
import type { ScoreKey } from "../types";

const SCORE: ScoreKey[] = ["done", "inflight", "lost", "failed"];

export function newSim(score: ScoreKey[] = SCORE) {
  return new QueueSim({ score, hub: "Message queue" });
}

export function runFor(sim: QueueSim, ms: number, step = 16) {
  for (let t = 0; t < ms; t += step) sim.tick(step);
}

function score(sim: QueueSim, key: ScoreKey) {
  return sim.view().panels.score.find((s) => s.key === key)?.value ?? 0;
}

describe("payments faults", () => {
  test("payments down drops orders that reach Charge and counts them as failed and lost", () => {
    const sim = newSim();
    sim.payments("down");
    sim.flood();
    runFor(sim, 9000);
    expect(score(sim, "failed")).toBeGreaterThan(0);
    expect(score(sim, "failed")).toBe(score(sim, "lost"));
    expect(score(sim, "done")).toBe(0);
    expect(sim.view().payments.state).toBe("down");
  });

  test("a payments fault expires after 10 s so later orders complete", () => {
    const sim = newSim();
    sim.payments("down");
    runFor(sim, 10_500);
    expect(sim.view().payments.state).toBe("ok");
    sim.flood();
    runFor(sim, 60_000);
    expect(score(sim, "done")).toBe(30);
    expect(score(sim, "failed")).toBe(0);
  });

  test("declined drops exactly the next order at Charge with a declined banner", () => {
    const sim = newSim();
    sim.payments("declined");
    sim.flood();
    runFor(sim, 60_000);
    expect(score(sim, "failed")).toBe(1);
    expect(score(sim, "lost")).toBe(1);
    expect(score(sim, "done")).toBe(29);
    expect(sim.view().banner.text).toMatch(/declined/i);
  });

  test("payments slow stretches Charge to 5 s but orders still complete", () => {
    const sim = newSim();
    sim.payments("slow");
    sim.flood();
    runFor(sim, 7000);
    expect(score(sim, "done")).toBe(0);
    runFor(sim, 60_000);
    expect(score(sim, "done")).toBe(30);
    expect(score(sim, "failed")).toBe(0);
  });
});
