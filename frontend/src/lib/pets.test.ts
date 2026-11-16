import { expect, test } from "vitest";
import { PETS, petPose } from "./pets";

test("pose follows the worker card", () => {
  expect(petPose({ up: true, downLeftMs: 0 })).toBe("idle");
  expect(petPose({ up: true, downLeftMs: 0, orderLabel: "Order #7" })).toBe("working");
  expect(petPose({ up: false, downLeftMs: 8000, orderLabel: "Order #7" })).toBe("ko");
  expect(petPose({ up: false, downLeftMs: 1500 })).toBe("waking");
  expect(petPose({ up: false, downLeftMs: 1 })).toBe("waking");
});

test("a worker down with no countdown (stopped outside the simulator, or restarting) looks knocked out", () => {
  expect(petPose({ up: false, downLeftMs: 0 })).toBe("ko");
});

test("each of the four workers has its own species", () => {
  expect([1, 2, 3, 4].map((id) => PETS[id].species)).toEqual(["dog", "cat", "rabbit", "fox"]);
});
