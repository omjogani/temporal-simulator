import { describe, expect, test } from "vitest";
import { getStep, tryThisLines } from "./steps";
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
