import { expect, test } from "vitest";
import { chipText, chipTone } from "./history";

test("chips are coloured by kind", () => {
  expect(chipTone("completed")).toBe("ok");
  expect(chipTone("timerStarted")).toBe("gold");
  expect(chipTone("timedOut")).toBe("bad");
  expect(chipTone("signaled")).toBe("blue");
  expect(chipTone("closed")).toBe("dim");
  expect(chipTone("nope")).toBe("dim");
});

test("chip text prefers the event label", () => {
  expect(chipText({ id: 1, kind: "scheduled", label: "Charge", worker: 0, t: 0 })).toBe("Charge");
  expect(chipText({ id: 2, kind: "completed", label: "", worker: 1, t: 0 })).toBe("Done");
  expect(chipText({ id: 3, kind: "started", label: "OrderWorkflow", worker: 0, t: 0 })).toBe("Started");
});
