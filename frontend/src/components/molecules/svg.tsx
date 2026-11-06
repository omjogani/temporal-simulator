import { Checkbox, SvgText, clientColor, toneColor } from "@/components/atoms/svg";
import type { ChecklistRowView } from "@/lib/types";

/** One activity on a worker's to-do list. */
export function ChecklistRow({ x, y, width, row, ghost }: { x: number; y: number; width: number; row: ChecklistRowView; ghost: boolean }) {
  const dimLabel = row.state === "placeholder" || row.state === "pending" || row.state === "skipped" || (ghost && row.state !== "done");
  const labelColor =
    row.state === "failed" ? "var(--c-fault)" : row.comp ? "var(--c-gold)" : dimLabel ? (row.state === "placeholder" ? "var(--c-ghost)" : "var(--c-dim)") : "var(--c-ink)";
  return (
    <g>
      <Checkbox x={x} y={y} state={row.state === "placeholder" ? "pending" : row.state} ghost={ghost} />
      <SvgText x={x + 22} y={y} size={11.5} color={labelColor} textDecoration={row.state === "failed" ? "line-through" : undefined}>
        {row.label}
      </SvgText>
      {row.meta && (
        <SvgText x={x + width} y={y} size={10} textAnchor="end" color={toneColor[row.metaTone ?? "dim"]}>
          {row.meta}
        </SvgText>
      )}
      {row.state === "running" && <rect x={x + 22} y={y + 6} width={(row.progress ?? 0) * 120} height={2.5} rx={1} style={{ fill: "var(--c-gold)" }} />}
    </g>
  );
}

/** A paused order on the shelf; click to resume. */
export function ShelfChip({ x, y, label, client, onClick }: { x: number; y: number; label: string; client: number; onClick: () => void }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Resume order ${label}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <rect x={x} y={y} width={72} height={18} rx={9} strokeWidth={1.5} style={{ fill: "var(--c-panel-2)", stroke: clientColor(client) }} />
      <SvgText x={x + 36} y={y + 13} size={10.5} textAnchor="middle">
        {label}
      </SvgText>
    </g>
  );
}
