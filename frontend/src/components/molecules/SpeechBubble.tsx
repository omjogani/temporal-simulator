import { SvgText, toneColor } from "@/components/atoms/svg";
import { VIEW } from "@/lib/geometry";
import type { Tone } from "@/lib/types";

const SIZE = 15;
const CHAR_W = SIZE * 0.62;

/** A speech bubble above a parcel, in board units: the real reply to the presenter's click. */
export function SpeechBubble({ x, y, text, tone }: { x: number; y: number; text: string; tone: Tone }) {
  const w = Math.min(VIEW.w - 20, text.length * CHAR_W + 22);
  const h = 28;
  const left = Math.max(10, Math.min(VIEW.w - w - 10, x - w / 2));
  const top = Math.max(6, y - 24 - h);
  const tipX = Math.max(left + 12, Math.min(left + w - 12, x));
  const color = toneColor[tone];
  return (
    <g pointerEvents="none" role="status">
      <path
        d={`M${left + 6} ${top}H${left + w - 6}Q${left + w} ${top} ${left + w} ${top + 6}V${top + h - 6}Q${left + w} ${top + h} ${left + w - 6} ${top + h}H${tipX + 6}L${tipX} ${top + h + 8}L${tipX - 6} ${top + h}H${left + 6}Q${left} ${top + h} ${left} ${top + h - 6}V${top + 6}Q${left} ${top} ${left + 6} ${top}Z`}
        strokeWidth={2}
        style={{ fill: "var(--c-panel)", stroke: color }}
      />
      <SvgText x={left + w / 2} y={top + h / 2 + 5} size={SIZE} weight={700} tone={tone} textAnchor="middle">
        {text}
      </SvgText>
    </g>
  );
}
