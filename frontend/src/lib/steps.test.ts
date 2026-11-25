import { describe, expect, test } from "vitest";
import { getStep, neighbours, sectionKeys, sectionOf, tryThisLines } from "./steps";
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

describe("step 1 button sections", () => {
  const step1 = getStep(1)!;

  test("step 1 groups its buttons into Crashes, Payments and Load", () => {
    expect(step1.sections?.map((s) => s.id)).toEqual(["crashes", "payments", "load"]);
    expect(step1.sections?.map((s) => s.label)).toEqual(["Crashes", "Payments", "Load"]);
  });

  test("every step 1 tool and action sits in exactly one section", () => {
    const items = [...step1.tools, ...step1.actions];
    for (const item of items) {
      const homes = step1.sections!.filter((s) => [...(s.tools ?? []), ...s.actions].includes(item as never));
      expect(homes, String(item)).toHaveLength(1);
    }
    const inSections = step1.sections!.flatMap((s) => [...(s.tools ?? []), ...s.actions]);
    expect(inSections.sort()).toEqual([...items].sort());
  });

  test("sectionOf finds the tab a hotkey belongs to", () => {
    expect(sectionOf(step1, "hammer")).toBe("crashes");
    expect(sectionOf(step1, "ackMode")).toBe("crashes");
    expect(sectionOf(step1, "payDown")).toBe("payments");
    expect(sectionOf(step1, "replayDlq")).toBe("payments");
    expect(sectionOf(step1, "bulkJob")).toBe("load");
    expect(sectionOf(step1, "pauseAll")).toBe("load");
    expect(sectionOf(step1, "reset")).toBeUndefined();
  });

  test("steps 2 to 5 keep their single toolbar", () => {
    for (const id of [2, 3, 4, 5]) expect(getStep(id)!.sections).toBeUndefined();
    expect(sectionOf(getStep(2)!, "hammer")).toBeUndefined();
  });
});

describe("section hotkey hints", () => {
  const step1 = getStep(1)!;

  test("sectionKeys lists the hotkeys of a tab, tools first, skipping buttons without a key", () => {
    expect(sectionKeys(step1, "crashes")).toEqual(["H", "F", "K"]);
    expect(sectionKeys(step1, "payments")).toEqual(["Z", "S", "D", "Q", "Y"]);
    expect(sectionKeys(step1, "load")).toEqual(["B"]);
  });

  test("an unknown section has no keys", () => {
    expect(sectionKeys(step1, "nope")).toEqual([]);
    expect(sectionKeys(getStep(2)!, "crashes")).toEqual([]);
  });
});
