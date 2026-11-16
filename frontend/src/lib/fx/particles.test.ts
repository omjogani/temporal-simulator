import { describe, expect, test } from "vitest";
import { EFFECT_TTL, type Effect, type EffectKind } from "./effects";
import { burst, stepParticle, type Particle, type Shape } from "./particles";

const fx = (kind: EffectKind, id = 7, power = 1): Effect => ({ id, kind, x: 300, y: 200, bornAt: 0, ttl: EFFECT_TTL[kind], color: "var(--c-client-2)", power });

const count = (ps: Particle[]) => {
  const c: Partial<Record<Shape, number>> = {};
  for (const p of ps) c[p.shape] = (c[p.shape] ?? 0) + 1;
  return c;
};

describe("burst", () => {
  test("particle counts and shapes per effect kind", () => {
    expect(count(burst(fx("tap")))).toEqual({ ring: 1 });
    expect(count(burst(fx("impact")))).toEqual({ ring: 1, star: 1, line: 16, text: 1 });
    expect(count(burst(fx("confetti")))).toEqual({ rect: 24 });
    expect(count(burst(fx("poof")))).toEqual({ circle: 10 });
    expect(count(burst(fx("coin")))).toEqual({ circle: 1, star: 6 });
    expect(count(burst(fx("spark")))).toEqual({ line: 12 });
    expect(burst(fx("shake"))).toEqual([]);
  });

  test("label is one text particle carrying the effect's text", () => {
    const e = { ...fx("label"), text: "↻" };
    const ps = burst(e);
    expect(ps).toHaveLength(1);
    expect(ps[0].shape).toBe("text");
    expect(ps[0].text).toBe("↻");
  });

  test("the hub's impact (power 2) has 32 shards", () => {
    expect(count(burst(fx("impact", 7, 2))).line).toBe(32);
  });

  test("impact text says BONK!", () => {
    expect(burst(fx("impact")).find((p) => p.shape === "text")?.text).toBe("BONK!");
  });

  test("confetti is half the effect colour, half white", () => {
    const colors = burst(fx("confetti")).map((p) => p.color);
    expect(colors.filter((c) => c === "var(--c-client-2)")).toHaveLength(12);
    expect(colors.filter((c) => c === "#ffffff")).toHaveLength(12);
  });

  test("deterministic per effect id", () => {
    expect(burst(fx("confetti", 3))).toEqual(burst(fx("confetti", 3)));
    expect(burst(fx("confetti", 3))).not.toEqual(burst(fx("confetti", 4)));
  });

  test("additive glow on sparks, coin glints and impact shards and ring; not on confetti, poof, text", () => {
    expect(burst(fx("spark")).every((p) => p.additive)).toBe(true);
    expect(burst(fx("coin")).filter((p) => p.shape === "star").every((p) => p.additive)).toBe(true);
    const impact = burst(fx("impact"));
    expect(impact.filter((p) => p.shape === "line" || p.shape === "ring").every((p) => p.additive)).toBe(true);
    expect(impact.find((p) => p.shape === "text")?.additive).toBe(false);
    expect(burst(fx("confetti")).some((p) => p.additive)).toBe(false);
    expect(burst(fx("poof")).some((p) => p.additive)).toBe(false);
  });

  test("every particle starts at the effect, unborn, within 1.5 × the effect's ttl", () => {
    for (const kind of Object.keys(EFFECT_TTL) as EffectKind[]) {
      for (const p of burst(fx(kind))) {
        expect([p.x, p.y, p.life]).toEqual([300, 200, 0]);
        expect(p.ttl).toBeLessThanOrEqual(EFFECT_TTL[kind] * 1.5);
        expect(p.ttl).toBeGreaterThan(0);
      }
    }
  });
});

describe("stepParticle", () => {
  const base = (): Particle => ({
    shape: "circle", x: 0, y: 0, vx: 1, vy: 0, gravity: 0.001, drag: 0, size: 2, grow: 0.1, spin: 0.01, rot: 0,
    color: "#fff", additive: false, life: 0, ttl: 20,
  });

  test("advances life, gravity, position, size and rotation", () => {
    const p = base();
    expect(stepParticle(p, 10)).toBe(true);
    expect(p.life).toBe(10);
    expect(p.vy).toBeCloseTo(0.01);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0.1);
    expect(p.size).toBeCloseTo(3);
    expect(p.rot).toBeCloseTo(0.1);
  });

  test("drag slows both velocities", () => {
    const p = { ...base(), gravity: 0, vy: 1, drag: 0.01 };
    stepParticle(p, 10);
    expect(p.vx).toBeCloseTo(0.9);
    expect(p.vy).toBeCloseTo(0.9);
  });

  test("returns false exactly when life reaches ttl", () => {
    const p = base();
    expect(stepParticle(p, 19)).toBe(true);
    expect(stepParticle(p, 1)).toBe(false);
  });
});
