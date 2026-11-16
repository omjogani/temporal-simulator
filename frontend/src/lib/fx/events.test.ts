import { describe, expect, test } from "vitest";
import { diffViews } from "./events";
import { dot, view } from "./testViews";

describe("diffViews", () => {
  test("first view (prev = null) emits nothing, even with outages and fated dots", () => {
    const next = view({ hubUp: false, down: [2], dots: [dot("a", { fate: "done" }), dot("b", { ring: "dup" })] });
    expect(diffViews(null, next)).toEqual([]);
  });

  test("worker going down and coming back", () => {
    expect(diffViews(view(), view({ down: [3] }))).toEqual([{ kind: "workerDown", worker: 3 }]);
    expect(diffViews(view({ down: [3] }), view({ down: [3] }))).toEqual([]);
    expect(diffViews(view({ down: [3] }), view())).toEqual([{ kind: "workerUp", worker: 3 }]);
  });

  test("hub going down and coming back", () => {
    expect(diffViews(view(), view({ hubUp: false }))).toEqual([{ kind: "hubDown" }]);
    expect(diffViews(view({ hubUp: false }), view())).toEqual([{ kind: "hubUp" }]);
  });

  test("a dot's fate emits once", () => {
    const a0 = dot("a", { client: 2 });
    const a1 = dot("a", { client: 2, fate: "done" });
    expect(diffViews(view({ dots: [a0] }), view({ dots: [a1] }))).toEqual([{ kind: "orderDone", id: "a", client: 2 }]);
    expect(diffViews(view({ dots: [a1] }), view({ dots: [a1] }))).toEqual([]);
    expect(diffViews(view({ dots: [a0] }), view({ dots: [dot("a", { client: 2, fate: "lost" })] }))).toEqual([{ kind: "orderLost", id: "a", client: 2 }]);
    expect(diffViews(view({ dots: [a0] }), view({ dots: [dot("a", { client: 2, fate: "failed" })] }))).toEqual([{ kind: "orderFailed", id: "a", client: 2 }]);
  });

  test("ring changes to charged, dup or retry", () => {
    const a0 = dot("a", { client: 1 });
    expect(diffViews(view({ dots: [a0] }), view({ dots: [dot("a", { client: 1, ring: "charged" })] }))).toEqual([{ kind: "charged", id: "a", client: 1 }]);
    expect(diffViews(view({ dots: [dot("a", { client: 1, ring: "charged" })] }), view({ dots: [dot("a", { client: 1, ring: "dup" })] }))).toEqual([
      { kind: "duplicate", id: "a", client: 1 },
    ]);
    expect(diffViews(view({ dots: [a0] }), view({ dots: [dot("a", { client: 1, ring: "retry" })] }))).toEqual([{ kind: "retry", id: "a", client: 1 }]);
    const c = dot("a", { ring: "charged" });
    expect(diffViews(view({ dots: [c] }), view({ dots: [c] }))).toEqual([]);
  });

  test("a dot first seen in next emits nothing", () => {
    expect(diffViews(view({ dots: [dot("x")] }), view({ dots: [dot("x"), dot("new", { fate: "done", ring: "charged" })] }))).toEqual([]);
  });

  test("a reset (no dot ids in common, nodes unchanged) emits nothing", () => {
    const prev = view({ dots: [dot("a"), dot("b")] });
    const next = view({ dots: [dot("c", { fate: "done" }), dot("d", { ring: "dup" })] });
    expect(diffViews(prev, next)).toEqual([]);
  });

  test("hidden and ghost dots never emit", () => {
    for (const extra of [{ hidden: true }, { ghost: true }]) {
      const prev = view({ dots: [dot("a", extra)] });
      const next = view({ dots: [dot("a", { ...extra, fate: "done", ring: "charged" })] });
      expect(diffViews(prev, next)).toEqual([]);
    }
  });
});
