import type { ReactNode } from "react";
import { NodeFrame, SvgText, clientColor, toneColor } from "@/components/atoms/svg";
import { ChecklistRow, ShelfChip } from "@/components/molecules/svg";
import { CLIENTS, HUB, PAY, SIDE, WORKER } from "@/lib/geometry";
import type { HubView, NodeId, PaymentsView, SideView, WorkerCardView } from "@/lib/types";

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

export function HubNode({ hub, onHit }: { hub: HubView; onHit: (n: NodeId) => void }) {
  const left = HUB.x - HUB.w / 2;
  const top = HUB.y - HUB.h / 2;
  return (
    <Hit node="hub" label={hub.label} onHit={onHit}>
      <NodeFrame x={HUB.x} y={HUB.y} w={HUB.w} h={HUB.h} down={!hub.up && !hub.starting} highlight={hub.starting} />
      <SvgText x={left + 14} y={top + 20} letterSpacing={1}>
        {hub.label.toUpperCase()}
      </SvgText>
      <SvgText x={left + HUB.w - 14} y={top + 20} textAnchor="end" tone={hub.up ? "dim" : hub.starting ? "gold" : "bad"}>
        {hub.info}
      </SvgText>
      {hub.more && (
        <SvgText x={left + HUB.w - 14} y={top + HUB.h - 10} textAnchor="end" size={11} tone="dim">
          {hub.more}
        </SvgText>
      )}
      {hub.lanes &&
        [0, 1, 2, 3].map((i) => (
          <SvgText key={i} x={left + 14} y={top + 40 + i * 17} size={10.5} color={clientColor(i)}>
            C{i + 1}
          </SvgText>
        ))}
    </Hit>
  );
}

export function PaymentsNode({ pay, onHit }: { pay: PaymentsView; onHit: (n: NodeId) => void }) {
  const tone = pay.state === "down" ? "bad" : pay.state === "slow" ? "gold" : "dim";
  return (
    <Hit node="pay" label="Payments API" onHit={onHit}>
      <NodeFrame x={PAY.x} y={PAY.y} w={PAY.w} h={PAY.h} down={pay.state === "down"} highlight={pay.state === "slow" || pay.flash} />
      <SvgText x={PAY.x} y={PAY.y - 8} textAnchor="middle">
        Payments API
      </SvgText>
      <SvgText x={PAY.x} y={PAY.y + 14} textAnchor="middle" size={11} tone={tone}>
        {pay.info}
      </SvgText>
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
    <Hit node={`w:${card.id}`} label={`Worker ${card.id}`} onHit={onHit}>
      <NodeFrame x={cx} y={top + WORKER.h / 2} w={WORKER.w} h={WORKER.h} down={!card.up} />
      <SvgText x={left + 14} y={top + 24} size={13.5} weight={600}>
        Worker {card.id}
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
    </Hit>
  );
}
