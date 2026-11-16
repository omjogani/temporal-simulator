import { describe, expect, test } from "vitest";
import { fxStep, newFxState } from "./fxState";
import { dot, view } from "./testViews";
import type { ArenaView } from "../types";

/** A view with given workers down; `timer` = hammered (has a countdown) vs restarting (no countdown). */
function down(ids: number[], timer: boolean): ArenaView {
  const v = view({ down: ids });
  for (const w of v.workers) if (ids.includes(w.id)) w.downLeftMs = timer ? 9000 : 0;
  return v;
}

const step = (s: ReturnType<typeof newFxState>, v: ArenaView, now: number, opts: { key?: unknown; hidden?: boolean } = {}) =>
  fxStep(s, { view: v, placed: [], now, resetKey: opts.key ?? "k", hidden: opts.hidden ?? false });

describe("fxStep", () => {
  test("a reset's worker restarts (down without a countdown, then up) fire nothing", () => {
    const s = newFxState();
    step(s, view(), 0);
    step(s, view(), 10, { key: "k2" }); // Reset pressed
    step(s, down([1, 2, 3, 4], false), 20, { key: "k2" });
    step(s, view(), 900, { key: "k2" });
    expect(s.effects).toEqual([]);
    expect(s.events).toEqual([]);
  });

  test("a hammered worker gets an impact going down and a spark coming back", () => {
    const s = newFxState();
    step(s, view(), 0);
    step(s, down([2], true), 10);
    expect(s.events.map((e) => e.kind)).toEqual(["workerDown"]);
    expect(s.effects.map((e) => e.kind).sort()).toEqual(["impact", "shake"]);
    step(s, down([2], false), 10_000); // countdown over, "starting…"
    step(s, view(), 11_000);
    expect(s.events.map((e) => e.kind)).toEqual(["workerDown", "workerUp"]);
    expect(s.effects.map((e) => e.kind)).toEqual(["spark"]);
  });

  test("a worker stopped outside the simulator (no countdown) gets no impact", () => {
    const s = newFxState();
    step(s, view(), 0);
    step(s, down([3], false), 10);
    step(s, view(), 5000);
    expect(s.events).toEqual([]);
  });

  test("while the tab is hidden nothing spawns, and nothing bursts on return", () => {
    const s = newFxState();
    const a = dot("a", { client: 1 });
    step(s, view({ dots: [a] }), 0);
    step(s, down([1], true), 5, { hidden: true }); // a's dot disappears too
    step(s, view({ dots: [dot("a", { client: 1, fate: "done" })] }), 5, { hidden: true });
    expect(s.effects).toEqual([]);
    expect(s.events).toEqual([]);
    step(s, view({ dots: [dot("a", { client: 1, fate: "done" })] }), 20_000);
    expect(s.effects).toEqual([]);
    expect(s.events).toEqual([]);
  });

  test("the hub: impact only for a hammer (countdown), spark when that outage ends", () => {
    const s = newFxState();
    step(s, view(), 0);
    const hubDown = view({ hubUp: false });
    hubDown.hub.downLeftMs = 9000;
    step(s, hubDown, 10);
    step(s, view(), 11_000);
    expect(s.events.map((e) => e.kind)).toEqual(["hubDown", "hubUp"]);
  });
});
