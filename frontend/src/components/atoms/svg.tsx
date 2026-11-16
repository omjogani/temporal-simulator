// SVG atoms for the board. Colours come from design tokens via inline style.
import type { ReactNode, SVGProps } from "react";
import type { RowState, Tone } from "@/lib/types";
import art from "./art.module.css";
import { smooth, type Pt } from "@/lib/geometry";

export const toneColor: Record<Tone, string> = {
  neutral: "var(--c-ink)",
  good: "var(--c-ok)",
  bad: "var(--c-fault)",
  gold: "var(--c-gold)",
  dim: "var(--c-dim)",
};

export const clientColor = (i: number) => `var(--c-client-${i + 1})`;

type TextProps = Omit<SVGProps<SVGTextElement>, "children"> & { tone?: Tone; color?: string; size?: number; weight?: number; children: ReactNode };

export function SvgText({ tone = "neutral", color, size = 12, weight = 400, style, children, ...rest }: TextProps) {
  return (
    <text
      fontFamily="var(--font-mono)"
      fontSize={size}
      fontWeight={weight}
      style={{ fill: color ?? toneColor[tone], ...style }}
      {...rest}
    >
      {children}
    </text>
  );
}

/** Glass box with a roof bar in the step accent: the frame of every board node. */
export function NodeFrame({ x, y, w, h, down, highlight, stroke, roof = "straight" }: { x: number; y: number; w: number; h: number; down?: boolean; highlight?: boolean; stroke?: string; roof?: "straight" | "crooked" }) {
  const left = x - w / 2;
  const top = y - h / 2;
  return (
    <>
      <rect
        x={left}
        y={top}
        width={w}
        height={h}
        rx={8}
        strokeWidth={1.5}
        style={{
          fill: down ? "var(--c-fault-bg)" : "var(--c-glass)",
          stroke: down ? "var(--c-fault)" : highlight ? "var(--c-gold)" : (stroke ?? "var(--c-glass-line)"),
          transition: "stroke .15s",
        }}
      />
      <rect
        x={left + 10}
        y={top - 1.5}
        width={w - 20}
        height={3}
        rx={1.5}
        transform={roof === "crooked" ? `rotate(1.5 ${x} ${top})` : undefined}
        style={{ fill: down ? "var(--c-fault)" : "var(--c-accent)" }}
      />
    </>
  );
}

/** A client's shop front: striped awning in its colour over a dark counter, centred on (x, y). */
export function Kiosk({ x, y, w, color, label }: { x: number; y: number; w: number; color: string; label: string }) {
  const h = 36;
  const left = x - w / 2;
  const top = y - h / 2;
  const awnTop = top - 4;
  const awnBottom = top + 9;
  const n = Math.round(w / 14); // scallops
  const s = w / n;
  let scallops = "";
  for (let k = n; k > 0; k--) {
    const x1 = left + k * s;
    const x0 = x1 - s;
    scallops += ` Q${(x0 + x1) / 2} ${awnBottom + 6} ${x0} ${awnBottom}`;
  }
  const awning = `M${left} ${awnTop} H${left + w} V${awnBottom}${scallops} Z`;
  const clip = `awn-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g>
      <rect x={left} y={top} width={w} height={h} rx={6} strokeWidth={1.5} style={{ fill: "var(--c-panel)", stroke: color }} />
      <clipPath id={clip}>
        <path d={awning} />
      </clipPath>
      <path d={awning} style={{ fill: color }} />
      <g clipPath={`url(#${clip})`}>
        {Array.from({ length: n }, (_, k) => (
          <rect key={k} x={left + k * s + s / 2} y={awnTop} width={s / 2} height={awnBottom - awnTop + 8} fill="#ffffff" opacity={0.28} />
        ))}
      </g>
      <SvgText x={x} y={top + 28} textAnchor="middle" size={11} color={color}>
        {label}
      </SvgText>
    </g>
  );
}

/** A conveyor belt along a wire path; the centre dashes run while `moving`. */
export function Wire({ pts, moving = true }: { pts: Pt[]; moving?: boolean }) {
  const d = smooth(pts)
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} strokeWidth={9} style={{ stroke: "var(--c-panel-2)" }} />
      <path d={d} strokeWidth={1.5} strokeDasharray="6 10" className={moving ? art.belt : undefined} style={{ stroke: "var(--c-wire)" }} />
    </g>
  );
}

export function Checkbox({ x, y, state, ghost }: { x: number; y: number; state: RowState; ghost?: boolean }) {
  let stroke = "var(--c-ghost)";
  let fill = "none";
  let mark = "";
  let markColor = "var(--c-ink)";
  if (state === "done") {
    stroke = fill = ghost ? "var(--c-ok-dim)" : "var(--c-ok)";
    mark = "✓";
    markColor = "var(--c-bg)";
  } else if (state === "reporting") {
    stroke = "var(--c-ok)";
    mark = "✓";
    markColor = "var(--c-ok)";
  } else if (state === "failed") {
    stroke = markColor = "var(--c-fault)";
    mark = "✗";
  } else if (state === "running") {
    stroke = "var(--c-gold)";
  } else if (state === "backoff") {
    stroke = markColor = "var(--c-gold)";
    mark = "⏳";
  } else if (state === "interrupted") {
    stroke = "var(--c-gold)";
  }
  return (
    <g>
      <rect x={x} y={y - 11} width={14} height={14} rx={3} strokeWidth={1.5} style={{ stroke, fill }} />
      {mark && (
        <SvgText x={x + 7} y={y + 1} size={11} weight={600} color={markColor} textAnchor="middle">
          {mark}
        </SvgText>
      )}
    </g>
  );
}
