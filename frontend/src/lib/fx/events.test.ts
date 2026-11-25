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

  test("canceled, stuck, timeout and replayed each emit once across identical follow-up views", () => {
    const a0 = dot("a", { client: 1 });
    const cases: [ReturnType<typeof dot>, ReturnType<typeof dot>, object][] = [
      [a0, dot("a", { client: 1, fate: "canceled" }), { kind: "orderCanceled", id: "a", client: 1 }],
      [a0, dot("a", { client: 1, ring: "stuck" }), { kind: "stuck", id: "a", client: 1 }],
      [a0, dot("a", { client: 1, tag: "heartbeat ⏱" }), { kind: "timeout", id: "a", client: 1, tag: "heartbeat ⏱" }],
    ];
    for (const [from, to, ev] of cases) {
      const v1 = view({ dots: [to] });
      expect(diffViews(view({ dots: [from] }), v1)).toEqual([ev]);
      expect(diffViews(v1, view({ dots: [to] }))).toEqual([]);
    }
    const r0 = view();
    const r1 = view();
    r1.workers[1] = { ...r1.workers[1], replayed: { events: 12, ago: 0 } };
    const r2 = view();
    r2.workers[1] = { ...r2.workers[1], replayed: { events: 12, ago: 1000 } };
    expect(diffViews(r0, r1)).toEqual([{ kind: "replayed", worker: 2 }]);
    expect(diffViews(r1, r2)).toEqual([]);
    expect(diffViews(r2, r2)).toEqual([]);
  });

  test("a changed tag does not re-fire and hidden/ghost dots stay quiet for the new kinds", () => {
    const t = dot("a", { tag: "x" });
    expect(diffViews(view({ dots: [t] }), view({ dots: [dot("a", { tag: "y" })] }))).toEqual([]);
    for (const extra of [{ hidden: true }, { ghost: true }]) {
      const next = view({ dots: [dot("a", { ...extra, ring: "stuck", tag: "x", fate: "canceled" })] });
      expect(diffViews(view({ dots: [dot("a", extra)] }), next)).toEqual([]);
    }
  });
});
