import { expect, test } from "vitest";
import { activeAnchor } from "./code";
import type { SnapOrder, SnapStep } from "./live/snapshot";

const st = (state: SnapStep["state"] = "pending"): SnapStep => ({ state, attempt: 0, worker: -1 });
const order = (o: Partial<SnapOrder> = {}): SnapOrder => ({
  id: "o1",
  num: 1,
  client: 0,
  declined: false,
  status: "running",
  worker: 1,
  steps: [st(), st(), st(), st()],
  current: 0,
  charged: 0,
  pauseRequested: false,
  giftWrap: false,
  address: "",
  waitUntil: 0,
  express: false,
  timeout: "",
  stuck: "",
  ...o,
});

test("no order, no anchor", () => {
  expect(activeAnchor(undefined, 1000, 101)).toBeUndefined();
});

test("courier while the workflow sleeps", () => {
  expect(activeAnchor(order({ waitUntil: 5000, current: 2 }), 1000, 101)).toBe("courier");
  expect(activeAnchor(order({ waitUntil: 500, current: 2 }), 1000, 101)).toBe("ship");
});

test("the step index picks the line", () => {
  expect(activeAnchor(order({ current: 0 }), 0, 101)).toBe("reserve");
  expect(activeAnchor(order({ current: 1 }), 0, 101)).toBe("charge");
  expect(activeAnchor(order({ current: 2 }), 0, 101)).toBe("ship");
  expect(activeAnchor(order({ current: 3 }), 0, 101)).toBe("email");
});

test("a running compensation step is cleanup", () => {
  const steps = [st("done"), st("failed"), st("skipped"), st("skipped"), st("running")];
  expect(activeAnchor(order({ steps, current: 4 }), 0, 103)).toBe("cleanup");
});

test("express ship is late, only in scene 105", () => {
  expect(activeAnchor(order({ current: 2, express: true }), 0, 105)).toBe("late");
  expect(activeAnchor(order({ current: 2, express: true }), 0, 104)).toBe("ship");
});
