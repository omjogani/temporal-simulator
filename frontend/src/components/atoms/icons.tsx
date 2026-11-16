// Tool icons, drawn in code. Each is a standalone <svg> sized by `size` (CSS px).

interface IconProps {
  size?: number;
}

/** A mallet at 45°: grey head, wooden handle. The hot spot is the head (top-left). */
export function HammerIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <g transform="rotate(-45 16 16)">
        <rect x={14.2} y={10} width={3.6} height={20} rx={1.6} fill="#a8743f" stroke="#5c3d1f" strokeWidth={1} />
        <rect x={14.2} y={24} width={3.6} height={3} fill="#7a5230" />
        <rect x={6} y={3} width={20} height={9} rx={2} fill="#c9ced6" stroke="#4a515c" strokeWidth={1.2} />
        <rect x={6} y={3} width={4} height={9} rx={1} fill="#e8ebe4" />
        <rect x={22} y={3} width={4} height={9} rx={1} fill="#8b94a0" />
      </g>
    </svg>
  );
}

/** An open palm: "stop right there" (pause a workflow). */
export function PauseHandIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <g fill="#f0c9a0" stroke="#8a5a36" strokeWidth={1.2} strokeLinejoin="round">
        {[
          [9, 7, 13],
          [13, 4, 15],
          [17, 4, 15],
          [21, 6, 13],
        ].map(([x, y, h]) => (
          <rect key={x} x={x - 1.8} y={y} width={3.6} height={h} rx={1.8} />
        ))}
        <path d="M7 16 C7 14 10 14 10 16 V18 L8.5 15 C7.6 13.4 5 14.5 5.9 16.4 L9 23 C10.5 26.5 13 28 17 28 C21.5 28 23.5 25 23.5 21 V15 H7 Z" />
      </g>
    </svg>
  );
}

/** A speaker; crossed out when muted. */
export function SpeakerIcon({ size = 18, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor" />
      {muted ? <path d="M17 9 L22 14 M22 9 L17 14" /> : <path d="M16.5 8.5 A5 5 0 0 1 16.5 15.5 M19 6 A8.5 8.5 0 0 1 19 18" />}
    </svg>
  );
}

export const TOOL_ICONS = { hammer: HammerIcon, pause: PauseHandIcon } as const;
