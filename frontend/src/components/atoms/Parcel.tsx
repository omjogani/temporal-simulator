import type { Ring } from "@/lib/types";
import art from "./art.module.css";
import { SvgText, clientColor } from "./svg";

interface Props {
  x: number;
  y: number;
  client: number;
  ring: Ring;
  opacity: number;
  ghost?: boolean;
  declined?: boolean;
  lost?: boolean;
  label?: string;
  /** Gift wrap: a signal arrived. */
  bow?: boolean;
  /** Small text under the parcel (e.g. "heartbeat"). */
  tag?: string;
  /** Canceled: grey and dashed. */
  canceled?: boolean;
  /** The presenter's selection: a white outline. */
  selected?: boolean;
  /** Box width in board units. */
  size?: number;
}

/** A coin badge: gold = charged once, red pair = charged twice. */
function Coins({ x, y, dup }: { x: number; y: number; dup: boolean }) {
  const c = dup ? "var(--c-fault)" : "var(--c-gold)";
  return (
    <g>
      {dup && <circle cx={x + 3} cy={y + 1} r={4} strokeWidth={1} style={{ fill: c, stroke: "var(--c-bg)" }} />}
      <circle cx={x} cy={y} r={4} strokeWidth={1} style={{ fill: c, stroke: "var(--c-bg)" }} />
    </g>
  );
}

/** One order on the board: a parcel in its client's colour, with badges for what happened to it. */
export function Parcel({ x, y, client, ring, opacity, ghost, declined, lost, label, bow, tag, canceled, selected, size = 14 }: Props) {
  const w = size;
  const h = size * 0.86;
  const hollow = ghost || ring === "ghost" || canceled;
  const color = lost ? "var(--c-fault)" : canceled ? "var(--c-ghost)" : clientColor(client);
  const corner = { x: w / 2, y: -h / 2 };
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} opacity={opacity}>
      {ring === "retry" && (
        <circle r={size * 0.8} fill="none" strokeWidth={2} strokeDasharray="3 3" className={art.spin} style={{ stroke: "var(--c-gold)" }} />
      )}
      {ring === "stuck" && (
        <circle r={size * 0.85} fill="none" strokeWidth={2.5} className={art.pulse} style={{ stroke: "var(--c-fault)" }} />
      )}
      {selected && <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx={4} fill="none" strokeWidth={1.8} style={{ stroke: "#ffffff" }} />}
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={2}
        strokeWidth={1}
        strokeDasharray={hollow ? "2 2" : undefined}
        opacity={hollow ? 0.6 : 1}
        style={{ fill: hollow ? "none" : color, stroke: hollow ? color : "rgba(0,0,0,0.45)" }}
      />
      {!hollow && <path d={`M0 ${-h / 2}V${h / 2}M${-w / 2} 0H${w / 2}`} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.5} />}
      {declined && (
        <g>
          <rect x={-w * 0.32} y={-h * 0.22} width={w * 0.64} height={h * 0.44} rx={1} strokeWidth={1} style={{ fill: "var(--c-panel)", stroke: "var(--c-violet)" }} />
          <path d={`M${-w * 0.36} ${h * 0.3}L${w * 0.36} ${-h * 0.3}`} strokeWidth={1.5} style={{ stroke: "var(--c-violet)" }} />
        </g>
      )}
      {(ring === "charged" || ring === "dup") && <Coins x={corner.x} y={corner.y} dup={ring === "dup"} />}
      {ring === "done" && (
        <g transform={`translate(${corner.x},${corner.y})`}>
          <circle r={4.5} style={{ fill: "var(--c-ok)" }} />
          <path d="M-2.2 0.2 L-0.6 1.8 L2.2 -1.4" fill="none" strokeWidth={1.4} style={{ stroke: "var(--c-bg)" }} />
        </g>
      )}
      {ring === "failed" && (
        <g transform={`translate(${corner.x},${corner.y})`}>
          <circle r={4.5} style={{ fill: "var(--c-fault)" }} />
          <path d="M-1.8 -1.8 L1.8 1.8 M1.8 -1.8 L-1.8 1.8" strokeWidth={1.4} style={{ stroke: "var(--c-bg)" }} />
        </g>
      )}
      {bow && (
        <g>
          <path d={`M0 ${-h / 2}C-6 ${-h / 2 - 7} -8 ${-h / 2 - 1} 0 ${-h / 2}C8 ${-h / 2 - 1} 6 ${-h / 2 - 7} 0 ${-h / 2}Z`} strokeWidth={1} style={{ fill: "var(--c-gold)", stroke: "rgba(0,0,0,0.5)" }} />
          <circle cy={-h / 2} r={1.6} style={{ fill: "var(--c-gold)", stroke: "rgba(0,0,0,0.5)" }} strokeWidth={0.8} />
        </g>
      )}
      {tag && (
        <SvgText x={0} y={h / 2 + 11} size={9.5} tone="gold" textAnchor="middle">
          {tag}
        </SvgText>
      )}
      {label && (
        <SvgText x={0} y={-size - 2} size={9.5} tone="gold" textAnchor="middle">
          {label}
        </SvgText>
      )}
    </g>
  );
}
