import type { ReactNode } from "react";
import { NodeFrame, SvgText, clientColor, toneColor } from "@/components/atoms/svg";
import { ChecklistRow, ShelfChip } from "@/components/molecules/svg";
import { CLIENTS, HUB, HUB_IN, SIDE, WORKER, queueCellX } from "@/lib/geometry";
import { workerName } from "@/lib/steps";
import type { HubView, NodeId, SideView, WorkerCardView } from "@/lib/types";

/** Makes a board node clickable and keyboard-operable. */
export function Hit({ node, label, onHit, children }: { node: NodeId; label: string; onHit: (n: NodeId) => void; children: ReactNode }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ cursor: "pointer" }}
      onClick={() => onHit(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onHit(node);
        }
      }}
    >
      {children}
    </g>
  );
}

export function ClientNode({ index, wide, onHit }: { index: number; wide: boolean; onHit: (n: NodeId) => void }) {
  const c = CLIENTS[index];
  const suffix = wide ? (index === 0 ? " · VIP" : index === 3 ? " · bulk" : "") : "";
  return (
    <Hit node={`c:${index}`} label={`Client ${index + 1}`} onHit={onHit}>
      <NodeFrame x={c.x} y={c.y} w={wide ? 150 : 110} h={36} stroke={clientColor(index)} />
      <SvgText x={c.x} y={c.y + 4} textAnchor="middle" color={clientColor(index)}>
        Client {index + 1}
        {suffix}
      </SvgText>
    </Hit>
  );
}

function StoreIcon({ x, y, kind }: { x: number; y: number; kind: HubView["store"] }) {
  const stroke = kind === "memory" ? "var(--c-fault)" : "var(--c-ok)";
  if (kind === "memory")
    // a RAM chip: gone when the process dies
    return (
      <g transform={`translate(${x},${y})`} fill="none" strokeWidth={1.5} style={{ stroke }}>
        <rect x={-7} y={-6} width={14} height={12} rx={2} />
        {[-4, 0, 4].map((d) => (
          <path key={d} d={`M${d} -9v3M${d} 6v3`} />
        ))}
      </g>
    );
  // a disk cylinder: survives a crash
  return (
    <g transform={`translate(${x},${y})`} fill="none" strokeWidth={1.5} style={{ stroke }}>
      <ellipse cx={0} cy={-6} rx={7} ry={2.5} />
      <path d="M-7 -6v11a7 2.5 0 0 0 14 0v-11M-7 -0.5a7 2.5 0 0 0 14 0" />
    </g>
  );
}

const STORE_TEXT: Record<HubView["store"], string> = {
  memory: "in memory · wiped on crash",
  disk: "messages on disk",
  history: "history in Postgres",
};

/** One horizontal pipe of queue cells; the head (next out) is on the right. */
function QueueTrack({ y, x0, h, cells, dim }: { y: number; x0: number; h: number; cells: number; dim: boolean }) {
  const headR = h / 2 - 5;
  const x1 = HUB.x + HUB.w / 2 - 12;
  return (
    <g opacity={dim ? 0.45 : 1}>
      <rect x={x0} y={y - h / 2} width={x1 - x0} height={h} rx={h / 2} strokeWidth={1.5} style={{ fill: "var(--c-board)", stroke: "var(--c-line)" }} />
      {Array.from({ length: cells }, (_, k) => (
        <circle key={k} cx={queueCellX(k)} cy={y} r={k === 0 ? headR : 2.5} strokeWidth={1.5} style={k === 0 ? { fill: "none", stroke: "var(--c-ok-dim)" } : { fill: "var(--c-line)" }} />
      ))}
    </g>
  );
}

/** The queue (Act 1) or Temporal Service (Act 2): a task queue pipe, retry timers and where state is stored. */
export function HubNode({ hub, onHit }: { hub: HubView; onHit: (n: NodeId) => void }) {
  const left = HUB.x - HUB.w / 2;
  const right = HUB.x + HUB.w / 2;
  const top = HUB.y - HUB.h / 2;
  const down = !hub.up && !hub.starting;
  const temporal = hub.store === "history";
  return (
    <Hit node="hub" label={hub.label} onHit={onHit}>
      <NodeFrame x={HUB.x} y={HUB.y} w={HUB.w} h={HUB.h} down={down} highlight={hub.starting} />
      <SvgText x={left + 14} y={top + 21} letterSpacing={1} weight={600}>
        {hub.label.toUpperCase()}
      </SvgText>
      <SvgText x={right - 14} y={top + 21} textAnchor="end" tone={hub.up ? "dim" : hub.starting ? "gold" : "bad"}>
        {hub.info}
      </SvgText>

      {hub.lanes ? (
        [0, 1, 2, 3].map((i) => {
          const y = HUB_IN.laneY0 + i * HUB_IN.laneH;
          return (
            <g key={i}>
              <SvgText x={left + 14} y={y + 4} size={10.5} color={clientColor(i)}>
                C{i + 1}
              </SvgText>
              <QueueTrack y={y} x0={left + 40} h={16} cells={HUB_IN.laneCells} dim={down} />
            </g>
          );
        })
      ) : (
        <>
          <SvgText x={left + 14} y={HUB_IN.queueY - 20} size={10} tone="dim" letterSpacing={1}>
            {temporal ? "TASK QUEUE · orders" : "QUEUE · orders"}
            {hub.more && <tspan style={{ fill: "var(--c-gold)" }}>{`  ${hub.more}`}</tspan>}
          </SvgText>
          <SvgText x={right - 14} y={HUB_IN.queueY - 20} size={10} tone="dim" textAnchor="end">
            next out ▸
          </SvgText>
          <QueueTrack y={HUB_IN.queueY} x0={left + 12} h={28} cells={HUB_IN.cells} dim={down} />
          {temporal && (
            <SvgText x={left + 14} y={HUB_IN.timerY + 4} size={10} tone="dim" letterSpacing={1}>
              TIMERS
            </SvgText>
          )}
          <StoreIcon x={right - 14 - 7} y={HUB_IN.timerY} kind={hub.store} />
          <SvgText x={right - 34} y={HUB_IN.timerY + 4} size={10.5} textAnchor="end" tone={hub.store === "memory" ? "bad" : "dim"}>
            {STORE_TEXT[hub.store]}
          </SvgText>
        </>
      )}
    </Hit>
  );
}

export function SideNode({ side, onHit, onResume }: { side: SideView; onHit: (n: NodeId) => void; onResume: (id: string) => void }) {
  const left = SIDE.x - SIDE.w / 2;
  const top = SIDE.y - SIDE.h / 2;
  const isDlq = side.kind === "dlq";
  return (
    <g>
      <Hit node="side" label={isDlq ? "Dead letters" : "Paused orders"} onHit={onHit}>
        <NodeFrame x={SIDE.x} y={SIDE.y} w={SIDE.w} h={SIDE.h} />
        <SvgText x={left + 12} y={top + 20} size={11} letterSpacing={1} tone={isDlq ? "bad" : "gold"}>
          {isDlq ? "DEAD LETTERS" : "PAUSED"}
        </SvgText>
        <SvgText x={left + SIDE.w - 12} y={top + 20} textAnchor="end" tone={isDlq ? "bad" : "gold"}>
          {side.count}
        </SvgText>
      </Hit>
      {side.chips.slice(0, 6).map((chip, k) => (
        <ShelfChip key={chip.id} x={left + 10 + (k % 2) * 78} y={top + 32 + Math.floor(k / 2) * 22} label={chip.label} client={chip.client} onClick={() => onResume(chip.id)} />
      ))}
    </g>
  );
}

/** A worker card: status, the order it is running, and its activity to-do list. */
export function WorkerCard({ card, onHit }: { card: WorkerCardView; onHit: (n: NodeId) => void }) {
  const cx = WORKER.xs[card.id - 1];
  const left = cx - WORKER.w / 2;
  const top = WORKER.top;
  return (
    <Hit node={`w:${card.id}`} label={`Worker ${workerName(card.id)}`} onHit={onHit}>
      <NodeFrame x={cx} y={top + WORKER.h / 2} w={WORKER.w} h={WORKER.h} down={!card.up} />
      <SvgText x={left + 14} y={top + 24} size={13.5} weight={600}>
        {workerName(card.id)}
      </SvgText>
      <SvgText x={left + WORKER.w - 14} y={top + 24} size={11} textAnchor="end" color={toneColor[card.statusTone]}>
        {card.status}
      </SvgText>
      <line x1={left + 12} y1={top + 36} x2={left + WORKER.w - 12} y2={top + 36} style={{ stroke: "var(--c-line)" }} />
      {card.orderLabel && (
        <SvgText x={left + 34} y={top + 58} tone={card.orderTone ?? "neutral"}>
          {card.orderLabel}
        </SvgText>
      )}
      {card.rows.slice(0, 5).map((row, i) => (
        <ChecklistRow key={i} x={left + 14} y={top + 86 + i * 30} width={WORKER.w - 28} row={row} ghost={card.ghost} />
      ))}
      <SvgText x={left + 14} y={top + WORKER.h - 14} size={11} tone="dim">
        {card.footer}
      </SvgText>
      {card.container && (
        <SvgText x={left + WORKER.w - 14} y={top + WORKER.h - 14} size={10} textAnchor="end" color={card.up ? "var(--c-client-3)" : "var(--c-fault)"}>
          {card.container}
        </SvgText>
      )}
    </Hit>
  );
}
