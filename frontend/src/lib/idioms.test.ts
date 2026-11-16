import { expect, test } from "vitest";
import { IDIOMS, getScene, neighbours, routeFor } from "./idioms";

test("scene ids are 101..108 and unique", () => {
  expect(IDIOMS.map((s) => s.id)).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
});

test("every scene has a rule, code and the idioms section", () => {
  for (const s of IDIOMS) {
    expect(s.rule, String(s.id)).toBeTruthy();
    expect(s.code, String(s.id)).toBeTruthy();
    expect(s.section).toBe("idioms");
  }
});

test("every anchor is inside its code lines", () => {
  for (const s of IDIOMS) {
    const n = s.code!.lines.length;
    expect(n).toBeLessThanOrEqual(14);
    for (const [name, i] of Object.entries(s.code!.anchors)) {
      expect(Number.isInteger(i) && i! >= 0 && i! < n, `${s.id} ${name}`).toBe(true);
    }
  }
});

test("routes and neighbours stay inside the section", () => {
  expect(routeFor(getScene(103)!)).toBe("/idioms/3");
  expect(neighbours(getScene(101)!).prev).toBeUndefined();
  expect(neighbours(getScene(101)!).next).toBe("/idioms/2");
  expect(neighbours(getScene(108)!).next).toBeUndefined();
});
