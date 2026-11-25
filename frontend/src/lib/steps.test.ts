import { describe, expect, test } from "vitest";
import { getStep, neighbours, tryThisLines } from "./steps";
import type { StepConfig } from "./steps";

const step = (tryThis: StepConfig["tryThis"]) => ({ tryThis }) as StepConfig;

describe("tryThisLines", () => {
  test("wraps a single caption into one line", () => {
    expect(tryThisLines(step("Hammer a worker."))).toEqual(["Hammer a worker."]);
  });

  test("returns numbered beats unchanged", () => {
    expect(tryThisLines(step(["one", "two"]))).toEqual(["one", "two"]);
  });

  test("step 1 is told as at least four short beats", () => {
    const lines = tryThisLines(getStep(1)!);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.every((l) => l.split(" ").length <= 14)).toBe(true);
  });

  test("live steps keep their single caption", () => {
    expect(tryThisLines(getStep(2)!)).toHaveLength(1);
  });
});

describe("step navigation", () => {
  test("neighbours link steps 1 to 5 in order and stop at the ends", () => {
    expect(neighbours(getStep(1)!)).toEqual({ prev: undefined, next: "/2" });
    expect(neighbours(getStep(3)!)).toEqual({ prev: "/2", next: "/4" });
    expect(neighbours(getStep(5)!)).toEqual({ prev: "/4", next: undefined });
  });
});
