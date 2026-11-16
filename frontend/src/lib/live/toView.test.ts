import { expect, test } from "vitest";
import { stepProgress } from "./toView";

test("progress is clamped to 0..1", () => {
  expect(stepProgress(1000, 1200, 500)).toBe(0); // browser clock behind the server
  expect(stepProgress(1250, 1000, 500)).toBe(0.5);
  expect(stepProgress(9000, 1000, 500)).toBe(1);
});

test("progress is 0 when the step has no timing yet", () => {
  expect(stepProgress(1000, undefined, 500)).toBe(0);
  expect(stepProgress(1000, 900, undefined)).toBe(0);
  expect(stepProgress(1000, 900, 0)).toBe(0);
});
