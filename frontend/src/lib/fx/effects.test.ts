import { describe, expect, test } from "vitest";
import { CLIENTS, HUB, SIDE, WORKER } from "../geometry";
import type { PlacedDot } from "../motion/useDotMotion";
import { EFFECT_TTL, anchor, nodeAnchor, prune, shakeOffset, spawn, type Effect, type EffectKind } from "./effects";
import type { FxEvent } from "./events";
import { dot } from "./testViews";

const placed: PlacedDot[] = [{ dot: dot("a"), x: 412, y: 233, opacity: 1 }];
const kinds = (list: Effect[]) => list.map((e) => e.kind);
const at = { x: 10, y: 20 };

describe("anchor / nodeAnchor", () => {
  test("worker and hub events anchor on the node", () => {
    expect(anchor({ kind: "workerDown", worker: 2 }, placed)).toEqual({ x: WORKER.xs[1], y: WORKER.top });
    expect(anchor({ kind: "workerUp", worker: 4 }, placed)).toEqual({ x: WORKER.xs[3], y: WORKER.top });
    expect(anchor({ kind: "hubDown" }, placed)).toEqual({ x: HUB.x, y: HUB.y });
    expect(anchor({ kind: "hubUp" }, placed)).toEqual({ x: HUB.x, y: HUB.y });
  });

  test("order events anchor on the placed dot, or nowhere", () => {
    expect(anchor({ kind: "orderDone", id: "a", client: 0 }, placed)).toEqual({ x: 412, y: 233 });
    expect(anchor({ kind: "orderDone", id: "zz", client: 0 }, placed)).toBeNull();
  });

  test("nodeAnchor for every node id", () => {
    expect(nodeAnchor("w:2")).toEqual({ x: WORKER.xs[1], y: WORKER.top });
    expect(nodeAnchor("hub")).toEqual({ x: HUB.x, y: HUB.y });
    expect(nodeAnchor("side")).toEqual({ x: SIDE.x, y: SIDE.y });
    expect(nodeAnchor("c:0")).toEqual({ x: CLIENTS[0].x, y: CLIENTS[0].y });
  });

  test("nodeAnchor for a parcel is its placed position, or nowhere", () => {
    expect(nodeAnchor("o:a", placed)).toEqual({ x: 412, y: 233 });
    expect(nodeAnchor("o:zz", placed)).toBeNull();
    expect(nodeAnchor("o:a")).toBeNull();
  });
});

describe("spawn", () => {
  test("outages: impact + shake, hub twice as strong", () => {
    const w = spawn({ kind: "workerDown", worker: 1 }, at, 0);
    expect(kinds(w).sort()).toEqual(["impact", "shake"]);
    expect(w.every((e) => e.power === 1)).toBe(true);
    const h = spawn({ kind: "hubDown" }, at, 0);
    expect(kinds(h).sort()).toEqual(["impact", "shake"]);
    expect(h.every((e) => e.power === 2)).toBe(true);
  });

  test("recoveries: one green spark", () => {
    for (const ev of [{ kind: "workerUp", worker: 1 }, { kind: "hubUp" }] as FxEvent[]) {
      const s = spawn(ev, at, 0);
      expect(kinds(s)).toEqual(["spark"]);
      expect(s[0].color).toBe("var(--c-ok)");
    }
  });

  test("order events map to their effect and colour", () => {
    const one = (ev: FxEvent) => {
      const s = spawn(ev, at, 0);
      expect(s).toHaveLength(1);
      return [s[0].kind, s[0].color];
    };
    expect(one({ kind: "orderDone", id: "a", client: 2 })).toEqual(["confetti", "var(--c-client-3)"]);
    expect(one({ kind: "orderLost", id: "a", client: 0 })).toEqual(["poof", "var(--c-dim)"]);
    expect(one({ kind: "orderFailed", id: "a", client: 0 })).toEqual(["poof", "var(--c-fault)"]);
    expect(one({ kind: "charged", id: "a", client: 0 })).toEqual(["coin", "var(--c-gold)"]);
    expect(one({ kind: "duplicate", id: "a", client: 0 })).toEqual(["spark", "var(--c-fault)"]);
    expect(one({ kind: "retry", id: "a", client: 0 })).toEqual(["spark", "var(--c-gold)"]);
  });

  test("bornAt, ttl and unique ids", () => {
    const a = spawn({ kind: "hubDown" }, at, 1234);
    const b = spawn({ kind: "hubDown" }, at, 1234);
    for (const e of [...a, ...b]) {
      expect(e.bornAt).toBe(1234);
      expect(e.ttl).toBe(EFFECT_TTL[e.kind]);
      expect(e.x).toBe(10);
      expect(e.y).toBe(20);
    }
    const ids = [...a, ...b].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("prune / shakeOffset", () => {
  const mk = (kind: EffectKind, bornAt: number, id: number): Effect => ({ id, kind, x: 0, y: 0, bornAt, ttl: EFFECT_TTL[kind], color: "", power: 1 });

  test("drops expired effects", () => {
    const list = [mk("tap", 0, 1), mk("confetti", 0, 2)];
    expect(prune(list, 200).map((e) => e.id)).toEqual([2]);
    expect(prune(list, 700)).toEqual([]);
  });

  test("caps at max, keeping the newest and preferring shake and impact", () => {
    const list: Effect[] = [mk("shake", 0, 0), mk("impact", 0, 1)];
    for (let i = 2; i < 100; i++) list.push(mk("confetti", i, i));
    const kept = prune(list, 100, 60);
    expect(kept).toHaveLength(60);
    expect(kept.some((e) => e.kind === "shake")).toBe(true);
    expect(kept.some((e) => e.kind === "impact")).toBe(true);
    const confetti = kept.filter((e) => e.kind === "confetti").map((e) => e.id);
    expect(Math.min(...confetti)).toBe(100 - 58); // the 58 newest confetti
  });

  test("shake offset is bounded and decays to zero", () => {
    expect(shakeOffset([], 0)).toEqual({ x: 0, y: 0 });
    const s = mk("shake", 0, 1);
    s.power = 2;
    for (let t = 0; t < s.ttl; t += 7) {
      const o = shakeOffset([s], t);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(8);
    }
    expect(shakeOffset([s], s.ttl)).toEqual({ x: 0, y: 0 });
  });
});
