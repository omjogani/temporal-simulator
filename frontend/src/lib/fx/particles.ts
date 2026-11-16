// Particle specs for each effect. Pure (no PixiJS here) so it can be tested; FxCanvas
// draws them. Units: board units (1000×600 viewBox) and milliseconds.
import type { Effect } from "./effects";

export type Shape = "rect" | "circle" | "line" | "star" | "ring" | "text";

export interface Particle {
  shape: Shape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Added to vy per ms. */
  gravity: number;
  /** Fraction of velocity lost per ms. */
  drag: number;
  /** Radius, half-width or line length, depending on shape. */
  size: number;
  grow: number;
  spin: number;
  rot: number;
  color: string;
  additive: boolean;
  life: number;
  ttl: number;
  text?: string;
}

export const MAX_PARTICLES = 1500;

/** Small seeded PRNG (mulberry32) so a burst looks the same every time it is drawn. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

export function burst(e: Effect): Particle[] {
  const r = rng(e.id * 2654435761);
  const between = (a: number, b: number) => a + (b - a) * r();
  const p = (shape: Shape, o: Partial<Particle>): Particle => ({
    shape, x: e.x, y: e.y, vx: 0, vy: 0, gravity: 0, drag: 0, size: 4, grow: 0, spin: 0, rot: 0,
    color: e.color, additive: false, life: 0, ttl: e.ttl, ...o,
  });
  /** n particles fanned evenly around the circle, with a little jitter. */
  const fan = (n: number, make: (angle: number, i: number) => Particle) =>
    Array.from({ length: n }, (_, i) => make((i / n) * TAU + between(-0.12, 0.12), i));

  switch (e.kind) {
    case "tap":
      return [p("ring", { size: 6, grow: 0.08, color: "#ffffff" })];

    case "impact": {
      const shards = fan(16 * e.power, (a, i) => {
        const v = between(0.25, 0.45) * (e.power > 1 ? 1.25 : 1);
        return p("line", {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: a, drag: 0.004, size: between(6, 10),
          color: i % 3 === 0 ? "var(--c-gold)" : "var(--c-fault)", additive: true, ttl: between(300, 450),
        });
      });
      return [
        p("ring", { size: 8, grow: 0.12 * e.power, additive: true, color: "var(--c-fault)" }),
        p("star", { size: 10 * e.power, grow: 0.04, spin: 0.004, additive: true, color: "var(--c-fault)" }),
        ...shards,
        p("text", { text: "BONK!", vy: -0.04, size: 22, color: "var(--c-gold)", ttl: 420 }),
      ];
    }

    case "confetti":
      return Array.from({ length: 24 }, (_, i) => {
        const a = between(-Math.PI * 0.92, -Math.PI * 0.08); // up and out
        const v = between(0.15, 0.4);
        return p("rect", {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity: 0.0012, drag: 0.002, size: between(2.5, 4.5),
          spin: between(-0.02, 0.02), rot: between(0, TAU), color: i % 2 ? "#ffffff" : e.color, ttl: between(700, 1000),
        });
      });

    case "poof":
      return fan(10, (a) => {
        const v = between(0.03, 0.08);
        return p("circle", { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02, drag: 0.002, size: between(4, 7), grow: 0.015, ttl: between(500, 800) });
      });

    case "coin": {
      const glints = fan(6, (a) => {
        const v = between(0.05, 0.12);
        return p("star", { vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.003, size: between(2, 3.5), additive: true, ttl: between(400, 650) });
      });
      // the coin rises 26 units and flips (the renderer squashes x by cos(rot))
      return [p("circle", { vy: -26 / e.ttl, size: 5, spin: TAU / e.ttl }), ...glints];
    }

    case "spark":
      return fan(12, (a) => {
        const v = between(0.2, 0.35);
        return p("line", { vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: a, drag: 0.005, size: between(4, 7), additive: true, ttl: between(300, 500) });
      });

    case "shake":
      return [];
  }
}

/** Advances one particle by dtMs (mutating it). Returns false once it has lived its ttl. */
export function stepParticle(p: Particle, dtMs: number): boolean {
  p.life += dtMs;
  p.vy += p.gravity * dtMs;
  const k = Math.max(0, 1 - p.drag * dtMs);
  p.vx *= k;
  p.vy *= k;
  p.x += p.vx * dtMs;
  p.y += p.vy * dtMs;
  p.size = Math.max(0, p.size + p.grow * dtMs);
  p.rot += p.spin * dtMs;
  return p.life < p.ttl;
}
