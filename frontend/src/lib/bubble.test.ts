import { expect, test } from "vitest";
import { bubbleVisible, type Bubble } from "./bubble";

const b: Bubble = { orderId: "o1", text: "hi", tone: "good", at: 1000 };

test("a bubble is visible for 4 s", () => {
  expect(bubbleVisible(b, 1000 + 3999)).toBe(true);
  expect(bubbleVisible(b, 1000 + 4001)).toBe(false);
});
