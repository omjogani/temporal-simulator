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

/** A pointer arrow. The hot spot is the tip (top-left). */
export function SelectIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M6 4 L6 24 L11 19.5 L14.5 27 L18 25.5 L14.6 18.2 L21 18 Z" fill="#f4f1e8" stroke="#2b2f36" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** A lightning bolt: inject an error. The hot spot is the bottom tip. */
export function ErrorIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M19 3 L8 18 H15 L12 29 L25 12 H17.5 Z" fill="#e5645c" stroke="#7a1f1a" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** A paper plane: fire-and-forget signal. The hot spot is the nose. */
export function SignalIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M3 15 L29 4 L22 28 L15 19 Z" fill="#d6a531" stroke="#6b5010" strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M15 19 L29 4" stroke="#6b5010" strokeWidth={1.2} fill="none" />
    </svg>
  );
}

/** A magnifying glass: read state without changing it. The hot spot is the lens. */
export function QueryIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx={13} cy={13} r={8} fill="rgba(160,210,255,0.35)" stroke="#2b2f36" strokeWidth={2} />
      <path d="M19 19 L28 28" stroke="#a8743f" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

/** A pencil: change a running workflow, with a reply. The hot spot is the tip. */
export function UpdateIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M5 27 L7 19 L21 5 L27 11 L13 25 Z" fill="#5fb865" stroke="#235a28" strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M5 27 L7 19 L13 25 Z" fill="#f0c9a0" stroke="#235a28" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/** A red stop sign cross: cancel. The hot spot is the centre. */
export function CancelIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx={16} cy={16} r={12} fill="#e5645c" stroke="#7a1f1a" strokeWidth={1.6} />
      <path d="M10.5 10.5 L21.5 21.5 M21.5 10.5 L10.5 21.5" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** A snowflake: freeze a pet. The hot spot is the centre. */
export function FreezeIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none" stroke="#8fd0ff" strokeWidth={2.2} strokeLinecap="round">
      <path d="M16 3 V29 M5 9.5 L27 22.5 M27 9.5 L5 22.5" />
      <path d="M12.5 5.5 L16 9 L19.5 5.5 M12.5 26.5 L16 23 L19.5 26.5" strokeWidth={1.6} />
    </svg>
  );
}

export const TOOL_ICONS = {
  hammer: HammerIcon,
  pause: PauseHandIcon,
  select: SelectIcon,
  error: ErrorIcon,
  signal: SignalIcon,
  query: QueryIcon,
  update: UpdateIcon,
  cancel: CancelIcon,
  freeze: FreezeIcon,
} as const;
