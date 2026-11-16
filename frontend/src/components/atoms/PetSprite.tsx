import { useId } from "react";
import type { PetPose, Species } from "@/lib/pets";
import { useReducedMotion } from "@/lib/fx/useFx";
import art from "./art.module.css";

interface Props {
  species: Species;
  color: string;
  pose: PetPose;
  /** Bottom-centre of the sprite; the paws rest 6 units above it. */
  x: number;
  y: number;
  /** Width in board units (the rig is drawn 56 wide). */
  size?: number;
  downLeftMs?: number;
  downTotalMs?: number;
}

const HEAD = { x: 0, y: -30, r: 15 };
const EDGE = -6; // where the card's top edge sits in sprite space
const shade = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #000)`;
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #fff)`;
const STAR = "M0 -3.2 L0.9 -0.9 L3.2 0 L0.9 0.9 L0 3.2 L-0.9 0.9 L-3.2 0 L-0.9 -0.9Z";

/** Ears drawn behind the head. */
function Ears({ species, color, line }: { species: Species; color: string; line: string }) {
  const s = { stroke: line, strokeWidth: 1.5 };
  switch (species) {
    case "dog":
      return null; // floppy ears hang in front of the head, see FrontEars
    case "cat":
      return (
        <g>
          {[-1, 1].map((d) => (
            <g key={d}>
              <path d={`M${d * 14} -37 L${d * 11} -53 L${d * 2} -43 Z`} style={{ fill: color, ...s }} strokeLinejoin="round" />
              <path d={`M${d * 11.5} -40 L${d * 10} -49 L${d * 5} -43 Z`} style={{ fill: "#e9a3a8" }} />
            </g>
          ))}
        </g>
      );
    case "rabbit":
      return (
        <g>
          {[-1, 1].map((d) => (
            <g key={d} transform={`rotate(${d * 8} ${d * 6} -42)`}>
              <ellipse cx={d * 6} cy={-54} rx={4.8} ry={12} style={{ fill: color, ...s }} />
              <ellipse cx={d * 6} cy={-53} rx={2.2} ry={8.5} style={{ fill: "#e9a3a8" }} />
            </g>
          ))}
        </g>
      );
    case "fox":
      return (
        <g>
          {[-1, 1].map((d) => (
            <g key={d}>
              <path d={`M${d * 15} -34 L${d * 14} -55 L${d * 2} -42 Z`} style={{ fill: color, ...s }} strokeLinejoin="round" />
              <path d={`M${d * 14.6} -48 L${d * 14} -55 L${d * 9.5} -50.5 Z`} style={{ fill: "#2a2320" }} />
            </g>
          ))}
        </g>
      );
  }
}

/** Face details drawn on top of the head (not the eyes). */
function Face({ species, color, line }: { species: Species; color: string; line: string }) {
  const nose = <ellipse cx={0} cy={-26.5} rx={2.2} ry={1.6} style={{ fill: "#2a2320" }} />;
  switch (species) {
    case "dog":
      return (
        <g>
          <ellipse cx={0} cy={-24} rx={7.5} ry={5.5} style={{ fill: tint(color, 55) }} />
          {nose}
          {[-1, 1].map((d) => (
            <ellipse key={d} cx={d * 14} cy={-30} rx={5.5} ry={11} transform={`rotate(${d * -18} ${d * 14} -38)`} style={{ fill: shade(color, 70), stroke: line, strokeWidth: 1.5 }} />
          ))}
        </g>
      );
    case "cat":
      return (
        <g>
          {nose}
          <path d="M-12 -25 H-5 M-12 -22 L-5 -24 M12 -25 H5 M12 -22 L5 -24" strokeWidth={0.8} style={{ stroke: line }} />
        </g>
      );
    case "rabbit":
      return (
        <g>
          <ellipse cx={0} cy={-24.5} rx={5} ry={3.5} style={{ fill: tint(color, 50) }} />
          <ellipse cx={0} cy={-26.5} rx={1.8} ry={1.3} style={{ fill: "#d9848c" }} />
        </g>
      );
    case "fox":
      return (
        <g>
          {[-1, 1].map((d) => (
            <ellipse key={d} cx={d * 7.5} cy={-23.5} rx={6.5} ry={5} style={{ fill: "#f3ece2" }} />
          ))}
          {nose}
        </g>
      );
  }
}

function Eyes({ pose }: { pose: PetPose }) {
  if (pose === "ko")
    return (
      <path d="M-7.5 -34 L-3.5 -30 M-3.5 -34 L-7.5 -30 M3.5 -34 L7.5 -30 M7.5 -34 L3.5 -30" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: "#2a2320" }} />
    );
  return (
    <g className={art.blink}>
      <circle cx={-5.5} cy={-32} r={2.1} style={{ fill: "#2a2320" }} />
      <circle cx={5.5} cy={-32} r={2.1} style={{ fill: "#2a2320" }} />
      <circle cx={-4.8} cy={-32.8} r={0.7} style={{ fill: "#fff" }} />
      <circle cx={6.2} cy={-32.8} r={0.7} style={{ fill: "#fff" }} />
    </g>
  );
}

/** One worker pet peeking over the top edge of its card. */
export function PetSprite({ species, color, pose, x, y, size = 56, downLeftMs = 0, downTotalMs = 1 }: Props) {
  const clip = useId();
  const reduced = useReducedMotion();
  const line = shade(color, 55);
  const down = pose === "ko" || pose === "waking";
  const bob = pose === "idle" ? art.bobSlow : pose === "working" ? art.bobFast : undefined;
  const left = Math.max(0, Math.min(1, downLeftMs / downTotalMs));
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${size / 56})`} pointerEvents="none">
      <clipPath id={clip}>
        <rect x={-40} y={-90} width={80} height={90 + EDGE} />
      </clipPath>
      <g className={bob}>
        {/* body, cut off at the card edge */}
        <ellipse cx={0} cy={-8} rx={18} ry={13} clipPath={`url(#${clip})`} style={{ fill: color, stroke: line, strokeWidth: 1.5 }} />
        <g transform={down ? `rotate(${pose === "ko" ? 18 : 0} 0 -16)` : undefined}>
          <g className={pose === "waking" ? art.wake : undefined}>
            <Ears species={species} color={color} line={line} />
            <circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r} style={{ fill: color, stroke: line, strokeWidth: 1.5 }} />
            <Face species={species} color={color} line={line} />
            <Eyes pose={pose} />
          </g>
        </g>
      </g>
      {/* paws on the edge of the card */}
      {[-1, 1].map((d) => (
        <ellipse
          key={d}
          cx={d * 10}
          cy={EDGE}
          rx={5.5}
          ry={3.6}
          className={pose === "working" ? (d < 0 ? art.pawL : art.pawR) : undefined}
          style={{ fill: tint(color, 75), stroke: line, strokeWidth: 1.2 }}
        />
      ))}
      {down && (
        <g>
          <circle
            cx={0}
            cy={HEAD.y}
            r={20}
            fill="none"
            strokeWidth={2.5}
            pathLength={100}
            strokeDasharray={`${(left * 100).toFixed(1)} 100`}
            strokeLinecap="round"
            transform={`rotate(-90 0 ${HEAD.y})`}
            style={{ stroke: "var(--c-fault)" }}
          />
          <g transform={`translate(0 ${HEAD.y - 22})`} opacity={pose === "waking" ? 0.4 : 1}>
            {[0, 1, 2].map((k) =>
              reduced ? (
                // no orbit: three stars held still on the ellipse
                <path key={k} d={STAR} transform={`translate(${[14, -7, -7][k]} ${[0, 3.9, -3.9][k]})`} style={{ fill: "var(--c-gold)" }} />
              ) : (
                <g key={k} className={art.orbit} style={{ animationDelay: `${(-k * 1.6) / 3}s` }}>
                  <path d={STAR} style={{ fill: "var(--c-gold)" }} />
                </g>
              ),
            )}
          </g>
        </g>
      )}
    </g>
  );
}
