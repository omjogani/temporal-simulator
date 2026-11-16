import { expect, test } from "vitest";
import type { FxEvent } from "./events";
import { soundFor, throttle, type SoundName } from "./sound";

test("each event maps to the sound in the spec's effect table", () => {
  const cases: [FxEvent, SoundName | null][] = [
    [{ kind: "workerDown", worker: 1 }, "thud"],
    [{ kind: "hubDown" }, "thud"],
    [{ kind: "workerUp", worker: 1 }, "pop"],
    [{ kind: "hubUp" }, "pop"],
    [{ kind: "orderDone", id: "a", client: 0 }, "ding"],
    [{ kind: "orderLost", id: "a", client: 0 }, "buzz"],
    [{ kind: "orderFailed", id: "a", client: 0 }, "buzz"],
    [{ kind: "duplicate", id: "a", client: 0 }, "buzz"],
    [{ kind: "charged", id: "a", client: 0 }, "coin"],
    [{ kind: "retry", id: "a", client: 0 }, null],
  ];
  for (const [ev, name] of cases) expect(soundFor(ev)).toBe(name);
});

test("throttle: one sound per name per 80 ms, names independent", () => {
  const last: Partial<Record<SoundName, number>> = {};
  expect(throttle(last, "ding", 1000)).toBe(true);
  expect(throttle(last, "ding", 1050)).toBe(false);
  expect(throttle(last, "coin", 1050)).toBe(true);
  expect(throttle(last, "ding", 1080)).toBe(true);
  expect(throttle(last, "ding", 1100, 200)).toBe(false);
});
