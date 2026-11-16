"use client";

import { useEffect, useRef } from "react";
import type { Application, Container, Graphics, Text } from "pixi.js";
import { VIEW } from "@/lib/geometry";
import type { Effect, XY } from "@/lib/fx/effects";
import { MAX_PARTICLES, burst, stepParticle, type Particle } from "@/lib/fx/particles";
import { useReducedMotion } from "@/lib/fx/useFx";
import styles from "./fx.module.css";

interface Props {
  effects: Effect[];
  shake: XY;
  ambient: "shed" | "depot";
  /** Changes on Reset: particles already flying are dropped at once. */
  resetKey: unknown;
}

interface Mote {
  x: number;
  y: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
}

const DUST = 40;
const LAMP_X = [170, 500, 830]; // under the stage lamps, in board units

function newMote(rand: () => number, anywhere: boolean): Mote {
  return {
    x: LAMP_X[Math.floor(rand() * LAMP_X.length)] + (rand() - 0.5) * 260,
    y: anywhere ? 60 + rand() * (VIEW.h - 60) : VIEW.h + 4,
    vy: -(0.006 + rand() * 0.008),
    r: 1 + rand() * 1.5,
    alpha: 0.05 + rand() * 0.13,
    phase: rand() * Math.PI * 2,
  };
}

/** CSS colour (hex or var(--c-…)) → a colour PixiJS understands. Cached per name. */
function colorResolver() {
  const cache = new Map<string, string>();
  const root = getComputedStyle(document.documentElement);
  return (c: string) => {
    if (!c.startsWith("var(")) return c;
    let v = cache.get(c);
    if (!v) {
      v = root.getPropertyValue(c.slice(4, -1).trim()).trim() || "#ffffff";
      cache.set(c, v);
    }
    return v;
  };
}

function draw(g: Graphics, p: Particle, color: string) {
  const alpha = Math.max(0, 1 - p.life / p.ttl);
  switch (p.shape) {
    case "rect": {
      const c = Math.cos(p.rot) * p.size;
      const s = Math.sin(p.rot) * p.size;
      g.poly([p.x - c + s, p.y - s - c, p.x + c + s, p.y + s - c, p.x + c - s, p.y + s + c, p.x - c - s, p.y - s + c]).fill({ color, alpha });
      break;
    }
    case "circle":
      if (p.spin) g.ellipse(p.x, p.y, Math.max(0.4, Math.abs(Math.cos(p.rot)) * p.size), p.size);
      else g.circle(p.x, p.y, p.size);
      g.fill({ color, alpha });
      break;
    case "line":
      g.moveTo(p.x, p.y)
        .lineTo(p.x - Math.cos(p.rot) * p.size, p.y - Math.sin(p.rot) * p.size)
        .stroke({ width: 1.8, color, alpha, cap: "round" });
      break;
    case "star":
      g.star(p.x, p.y, p.size >= 6 ? 8 : 4, p.size, p.size * 0.42, p.rot).fill({ color, alpha });
      break;
    case "ring":
      g.circle(p.x, p.y, p.size).stroke({ width: 2.2, color, alpha });
      break;
    case "text":
      break; // drawn with a pooled Text
  }
}

/**
 * A transparent PixiJS (WebGL) canvas over the board for particle effects and drifting
 * dust. Board units map 1:1 to stage units. If WebGL is unavailable the board simply
 * has no particles; with reduced motion the canvas is never created.
 */
export function FxCanvas({ effects, shake, ambient, resetKey }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const latest = useRef({ effects, shake, ambient, resetKey });
  useEffect(() => {
    latest.current = { effects, shake, ambient, resetKey };
  });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = wrap.current;
    if (reduced || !el) return;
    let disposed = false;
    let app: Application | null = null;
    let ro: ResizeObserver | null = null;

    void (async () => {
      try {
        const PIXI = await import("pixi.js");
        const a = new PIXI.Application();
        const resolution = () => Math.min(4, (window.devicePixelRatio || 1) * (Number(document.documentElement.style.zoom) || 1));
        await a.init({
          backgroundAlpha: 0,
          antialias: true,
          preference: "webgl",
          autoDensity: true,
          resolution: resolution(),
          width: Math.max(1, el.clientWidth),
          height: Math.max(1, el.clientHeight),
        });
        if (disposed) {
          a.destroy({ removeView: true }, { children: true });
          return;
        }
        app = a;
        el.appendChild(a.canvas);

        const stage: Container = new PIXI.Container();
        a.stage.addChild(stage);
        const dustG = new PIXI.Graphics();
        dustG.blendMode = "add";
        const normalG = new PIXI.Graphics();
        const addG = new PIXI.Graphics();
        addG.blendMode = "add";
        const texts = new PIXI.Container();
        stage.addChild(dustG, normalG, addG, texts);
        const textPool: Text[] = [];

        let scale = 1;
        const fit = () => {
          const w = Math.max(1, el.clientWidth);
          const h = Math.max(1, el.clientHeight);
          a.renderer.resize(w, h, resolution());
          scale = w / VIEW.w;
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(el);

        const resolve = colorResolver();
        const font = getComputedStyle(document.documentElement).getPropertyValue("--font-big-shoulders").trim() || "Impact";
        const rand = Math.random;
        const dust: Mote[] = Array.from({ length: DUST }, () => newMote(rand, true));
        let particles: Particle[] = [];
        const seen = new Set<number>();
        let clock = 0;
        let lastReset = latest.current.resetKey;

        a.ticker.add((t) => {
          // A long gap means the tab was in the background: take what is listed now as
          // already shown instead of bursting it all at once.
          const stale = t.deltaMS > 250;
          const dt = Math.min(50, t.deltaMS);
          clock += dt;
          const { effects: list, shake: off, ambient: mood, resetKey: rk } = latest.current;
          if (rk !== lastReset) {
            lastReset = rk;
            particles = [];
          }

          // new effects → particles
          const ids = new Set<number>();
          for (const e of list) {
            ids.add(e.id);
            if (!seen.has(e.id)) {
              seen.add(e.id);
              if (!stale) particles.push(...burst(e));
            }
          }
          for (const id of seen) if (!ids.has(id)) seen.delete(id);

          particles = particles.filter((p) => stepParticle(p, dt));
          if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);

          stage.scale.set(scale);
          stage.position.set(off.x * scale, off.y * scale);

          // dust under the lamps
          dustG.clear();
          const dustColor = resolve(mood === "depot" ? "var(--c-gold)" : "var(--c-client-3)");
          for (let i = 0; i < dust.length; i++) {
            const m = dust[i];
            m.y += m.vy * dt;
            if (m.y < 40) dust[i] = newMote(rand, false);
            const x = m.x + Math.sin(clock * 0.0007 + m.phase) * 6;
            dustG.circle(x, m.y, m.r).fill({ color: dustColor, alpha: m.alpha });
          }

          normalG.clear();
          addG.clear();
          let ti = 0;
          for (const p of particles) {
            const color = resolve(p.color);
            if (p.shape === "text") {
              let txt = textPool[ti];
              if (!txt) {
                txt = new PIXI.Text({ text: "", style: { fontFamily: font, fontWeight: "800", fontSize: 22, fill: "#ffffff", stroke: { color: "#14171c", width: 4 } } });
                txt.anchor.set(0.5);
                textPool.push(txt);
                texts.addChild(txt);
              }
              txt.text = p.text ?? "";
              txt.style.fill = color;
              txt.position.set(p.x, p.y - 18);
              txt.alpha = Math.max(0, 1 - p.life / p.ttl);
              txt.scale.set(Math.min(1, 0.6 + (p.life / p.ttl) * 3));
              txt.visible = true;
              ti++;
              continue;
            }
            draw(p.additive ? addG : normalG, p, color);
          }
          for (let k = ti; k < textPool.length; k++) textPool[k].visible = false;
        });
      } catch (err) {
        console.warn("Effects canvas disabled (no WebGL?):", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      app?.destroy({ removeView: true }, { children: true });
      app = null;
    };
  }, [reduced]);

  return <div ref={wrap} className={styles.canvas} aria-hidden />;
}
