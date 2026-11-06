// SVG atoms for the board. Colours come from design tokens via inline style.
import type { ReactNode, SVGProps } from "react";
import type { Ring, RowState, Tone } from "@/lib/types";
import type { Pt } from "@/lib/geometry";

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

/** Box with optional fault styling: the frame of every board node. */
export function NodeFrame({ x, y, w, h, down, highlight, stroke }: { x: number; y: number; w: number; h: number; down?: boolean; highlight?: boolean; stroke?: string }) {
  return (
    <rect
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      rx={8}
      strokeWidth={2}
      style={{
        fill: down ? "var(--c-fault-bg)" : "var(--c-panel)",
        stroke: down ? "var(--c-fault)" : highlight ? "var(--c-gold)" : (stroke ?? "var(--c-line)"),
        transition: "stroke .15s",
      }}
    />
  );
}

export function Wire({ pts }: { pts: Pt[] }) {
  return (
    <g>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: "var(--c-wire)" }} opacity={0.75} />
      {pts.slice(1, -1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} style={{ fill: "var(--c-wire)" }} />
      ))}
    </g>
  );
}

const ringColor: Record<Ring, string | null> = {
  none: null,
  charged: "var(--c-gold)",
  dup: "var(--c-fault)",
  ghost: "var(--c-dim)",
  done: "var(--c-ok)",
  failed: "var(--c-gold)",
  retry: "var(--c-gold)",
};

/** One order on the board. */
export function OrderDot({ x, y, client, ring, opacity, ghost, declined, lost, label }: { x: number; y: number; client: number; ring: Ring; opacity: number; ghost?: boolean; declined?: boolean; lost?: boolean; label?: string }) {
  const rc = ringColor[ring];
  const fill = lost ? "var(--c-fault)" : ghost ? "var(--c-ghost)" : declined ? "var(--c-violet)" : clientColor(client);
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} opacity={opacity}>
      {rc && <circle r={11} fill="none" strokeWidth={2.5} strokeDasharray={ring === "ghost" || ring === "retry" ? "3 3" : undefined} style={{ stroke: rc }} />}
      <circle r={7} style={{ fill, stroke: declined ? "var(--c-ink)" : "none" }} strokeWidth={1.5} />
      {label && (
        <SvgText x={0} y={-15} size={9.5} tone="gold" textAnchor="middle">
          {label}
        </SvgText>
      )}
    </g>
  );
}

export function Spark({ from, to, bad, age }: { from: Pt; to: Pt; bad: boolean; age: number }) {
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      strokeWidth={2.5}
      strokeDasharray={bad ? "5 5" : undefined}
      style={{ stroke: bad ? "var(--c-fault)" : "var(--c-gold)" }}
      opacity={Math.max(0, 1 - age / 380)}
    />
  );
}

/** The square on a to-do row. */
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
