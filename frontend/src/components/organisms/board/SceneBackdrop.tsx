import { memo } from "react";
import art from "@/components/atoms/art.module.css";

export type SceneVariant = "shed" | "depot";

const W = 1440;
const H = 620;
const WALL = 90; // height of the back wall band
const LAMPS = [360, 720, 1080];

interface Mood {
  bg: [string, string];
  wall: string;
  floor: string;
  lamp: string;
}

const MOOD: Record<SceneVariant, Mood> = {
  shed: { bg: ["#161a22", "#0f1217"], wall: "#151a22", floor: "#12161c", lamp: "#5ea2f0" }, // Act 1: cold, dark
  depot: { bg: ["#1f2228", "#14171c"], wall: "#1d2027", floor: "#191c22", lamp: "#e9c04f" }, // Act 2: warm, lit
};

/** A shelf unit with crates, drawn at the far edge of the stage (behind the side panels). */
function Shelf({ x, flip }: { x: number; flip?: boolean }) {
  const crates = [
    [0, 0, 46, 34],
    [52, 6, 38, 28],
    [8, 52, 40, 30],
    [56, 46, 52, 36],
    [4, 104, 58, 34],
  ];
  return (
    <g transform={`translate(${x},${WALL + 40}) ${flip ? "scale(-1,1)" : ""}`} opacity={0.9}>
      {/* uprights and boards */}
      <rect x={-6} y={-10} width={6} height={160} fill="#262b33" />
      <rect x={124} y={-10} width={6} height={160} fill="#262b33" />
      {[34, 86, 140].map((y) => (
        <rect key={y} x={-6} y={y} width={136} height={5} fill="#2a2f38" />
      ))}
      {crates.map(([cx, cy, w, h], i) => (
        <g key={i} transform={`translate(${cx},${cy})`}>
          <rect width={w} height={h} rx={2} fill={i % 2 ? "#2a2c2f" : "#2d2a26"} stroke="#363d48" />
          <path d={`M0 ${h / 2}H${w}M${w / 2} 0V${h}`} stroke="#363d48" strokeWidth={1} />
        </g>
      ))}
    </g>
  );
}

function Lamp({ x, color, flicker }: { x: number; color: string; flicker?: boolean }) {
  return (
    <g className={flicker ? art.flicker : undefined}>
      <line x1={x} y1={0} x2={x} y2={18} stroke="#2a2f38" strokeWidth={2} />
      <circle cx={x} cy={36} r={220} fill="url(#lamp-glow)" />
      <path d={`M${x - 20} 34 L${x - 8} 18 H${x + 8} L${x + 20} 34 Z`} fill="#2a2f38" stroke="#363d48" />
      <ellipse cx={x} cy={35} rx={11} ry={3} fill={color} opacity={0.85} />
    </g>
  );
}

/** The illustrated stage behind the arena: the Act 1 shed or the Act 2 depot. */
export const SceneBackdrop = memo(function SceneBackdrop({ variant }: { variant: SceneVariant }) {
  const m = MOOD[variant];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="stage-bg" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor={m.bg[0]} />
          <stop offset="100%" stopColor={m.bg[1]} />
        </radialGradient>
        <radialGradient id="lamp-glow">
          <stop offset="0%" stopColor={m.lamp} stopOpacity={0.1} />
          <stop offset="100%" stopColor={m.lamp} stopOpacity={0} />
        </radialGradient>
        <pattern id="floor-tiles" width={96} height={48} patternUnits="userSpaceOnUse">
          <path d="M48 0 L96 24 L48 48 L0 24 Z" fill="none" stroke="#ffffff" strokeOpacity={0.06} />
        </pattern>
        <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity={0.35} />
          <stop offset="30%" stopColor="#000" stopOpacity={0} />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#stage-bg)" />

      {/* back wall */}
      <rect width={W} height={WALL} fill={m.wall} />
      {variant === "shed"
        ? Array.from({ length: Math.ceil(W / 14) }, (_, i) => (
            <line key={i} x1={i * 14} y1={0} x2={i * 14} y2={WALL} stroke="#ffffff" strokeOpacity={0.035} strokeWidth={2} />
          ))
        : Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={40 + i * 120} y={22} width={72} height={30} rx={2} fill="#ffffff" fillOpacity={0.025} stroke="#ffffff" strokeOpacity={0.04} />
          ))}
      <rect y={WALL - 3} width={W} height={3} fill="#2a2f38" />

      {/* floor */}
      <rect y={WALL} width={W} height={H - WALL} fill={m.floor} />
      <rect y={WALL} width={W} height={H - WALL} fill="url(#floor-tiles)" />
      <rect y={WALL} width={W} height={H - WALL} fill="url(#floor-fade)" />

      {/* shelves at the far edges, behind the side panels */}
      <Shelf x={24} />
      <Shelf x={W - 24} flip />

      {LAMPS.map((x, i) => (
        <Lamp key={x} x={x} color={m.lamp} flicker={variant === "shed" && i === 1} />
      ))}
    </svg>
  );
});
