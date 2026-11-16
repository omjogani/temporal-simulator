"use client";

import type { CSSProperties } from "react";
import { SceneBackdrop } from "@/components/organisms/board/SceneBackdrop";
import { stepAccent, type StepConfig } from "@/lib/steps";
import styles from "./ScenarioMenu.module.css";

interface Props {
  steps: StepConfig[];
  selected: number;
  onSelect(i: number): void;
  onStart(id: number): void;
}

/** "Timeouts & retries" → ["TIMEOUTS &", "RETRIES"]; short names stay on one line. */
function labelLines(name: string): string[] {
  const up = name.toUpperCase();
  const i = up.indexOf(" & ");
  return i < 0 ? [up] : [up.slice(0, i + 2), up.slice(i + 3)];
}

/** One game cartridge for a step, drawn at 220 × 250. */
function Cartridge({ step }: { step: StepConfig }) {
  const accent = stepAccent(step.id);
  const dark = `color-mix(in srgb, ${accent} 55%, #000)`;
  const lines = labelLines(step.name);
  const sticker = step.section === "idioms" ? "REAL TEMPORAL · 8 SCENES" : `${step.id} · ${step.act === 1 ? "WITHOUT TEMPORAL" : "REAL TEMPORAL"}`;
  return (
    <svg viewBox="0 0 220 250" width={220} height={250} aria-hidden>
      {/* side face for depth */}
      <path d="M22 14 H206 Q214 14 214 22 V236 Q214 244 206 244 H22 Z" style={{ fill: dark }} />
      {/* body */}
      <path d="M8 8 H192 Q200 8 200 16 V40 L206 46 V226 Q206 236 196 236 H14 Q6 236 6 226 V16 Q6 8 14 8 Z" strokeWidth={2.5} style={{ fill: accent, stroke: dark }} />
      {/* grip ridges */}
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={60 + k * 20} y={16} width={10} height={14} rx={2} style={{ fill: dark }} opacity={0.6} />
      ))}
      {/* label window */}
      <rect x={22} y={40} width={164} height={104} rx={8} strokeWidth={3} style={{ fill: "#1a1e24", stroke: dark }} />
      {lines.map((l, k) => (
        <text
          key={k}
          x={104}
          y={lines.length === 1 ? 102 : 84 + k * 34}
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight={800}
          fontSize={l.length > 9 ? 26 : 32}
          letterSpacing={1}
          style={{ fill: accent }}
        >
          {l}
        </text>
      ))}
      {/* shine */}
      <path d="M30 48 L60 48 L36 136 L28 136 Z" fill="#ffffff" opacity={0.06} />
      {/* paper sticker */}
      <g transform="rotate(-3 104 186)">
        <rect x={30} y={168} width={148} height={36} rx={3} fill="#f0ead8" stroke="#c9bfa3" />
        <text x={104} y={191} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={600} fontSize={11} fill="#2a2320">
          {sticker}
        </text>
      </g>
      {/* screws */}
      {[22, 186].map((x) => (
        <circle key={x} cx={x} cy={222} r={4} style={{ fill: dark }} />
      ))}
    </svg>
  );
}

/** Where cartridge i sits in the fan, relative to the selected one. */
function fanStyle(d: number): CSSProperties {
  const a = Math.abs(d);
  const s = Math.sign(d);
  if (a === 0) return { transform: "translateX(0) scale(1) rotate(0)", zIndex: 10, opacity: 1 };
  if (a === 1) return { transform: `translateX(${s * 190}px) scale(0.8) rotate(${s * 8}deg)`, zIndex: 9, opacity: 1 };
  return { transform: `translateX(${s * 330}px) scale(0.65) rotate(${s * 12}deg)`, zIndex: 10 - a, opacity: a === 2 ? 0.6 : 0 };
}

/** The scenario picker at `/`: five cartridges in a fan, like a console menu. */
export function ScenarioMenu({ steps, selected, onSelect, onStart }: Props) {
  const step = steps[selected];
  return (
    <main className={styles.menu} style={{ "--c-accent": stepAccent(step.id) } as CSSProperties}>
      <div className={styles.backdrop} aria-hidden>
        <SceneBackdrop variant="depot" />
      </div>
      <h1 className={styles.title}>Temporal Chaos Simulator</h1>
      <p className={styles.lead}>Choose a scenario</p>

      <div className={styles.carousel}>
        <button type="button" className={styles.arrow} aria-label="Previous scenario" disabled={selected === 0} onClick={() => onSelect(selected - 1)}>
          ◀
        </button>
        <div className={styles.fan} role="listbox" aria-label="Scenarios" aria-activedescendant={`cart-${step.id}`}>
          {steps.map((s, i) => (
            <div
              key={s.id}
              id={`cart-${s.id}`}
              role="option"
              aria-selected={i === selected}
              aria-label={s.id >= 100 ? s.name : `${s.id}. ${s.name}`}
              className={styles.cart}
              style={fanStyle(i - selected)}
              onClick={() => (i === selected ? onStart(s.id) : onSelect(i))}
            >
              <Cartridge step={s} />
            </div>
          ))}
        </div>
        <button type="button" className={styles.arrow} aria-label="Next scenario" disabled={selected === steps.length - 1} onClick={() => onSelect(selected + 1)}>
          ▶
        </button>
      </div>

      <p className={styles.blurb}>{step.tryThis}</p>
      <button type="button" className={styles.start} onClick={() => onStart(step.id)}>
        ▶ Start <kbd>Enter</kbd>
      </button>
      <p className={styles.keys}>
        <kbd>←</kbd> <kbd>→</kbd> choose · <kbd>1</kbd>–<kbd>5</kbd> jump in · <kbd>6</kbd> idioms · <kbd>Esc</kbd> in a scenario comes back here
      </p>
    </main>
  );
}
