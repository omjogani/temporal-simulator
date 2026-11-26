import type { ReactNode } from "react";
import { Kiosk, NodeFrame, SvgText, clientColor, toneColor } from "@/components/atoms/svg";
import { ChecklistRow, ShelfChip } from "@/components/molecules/svg";
import { CLIENTS, HUB, HUB_IN, SIDE, WORKER, queueCellX } from "@/lib/geometry";
import { PetSprite } from "@/components/atoms/PetSprite";
import { PauseHandIcon } from "@/components/atoms/icons";
import art from "@/components/atoms/art.module.css";
import { PETS, petPose } from "@/lib/pets";
import { HAMMER_MS, workerName } from "@/lib/steps";
import type { HubView, NodeId, SideView, WorkerCardView } from "@/lib/types";

/** Makes a board node clickable and keyboard-operable. */
export function Hit({ node, label, onHit, children }: { node: NodeId; label: string; onHit: (n: NodeId) => void; children: ReactNode }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ cursor: "pointer" }}
      // A mouse click must not leave focus here, or a later Space (play/pause) would hit the node again.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onHit(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation(); // Space here must not also toggle play (window handler)
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
  const suffix = wide ? (index <= 1 ? " · VIP" : "") : "";
  return (
    <Hit node={`c:${index}`} label={`Client ${index + 1}`} onHit={onHit}>
      <Kiosk x={c.x} y={c.y} w={wide ? 150 : 110} color={clientColor(index)} label={`Client ${index + 1}${suffix}`} />
    </Hit>
  );
}

/** Act 2: the Postgres vault where Temporal keeps history. It glows even while the server is down. */
function Vault({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-17} y={-13} width={34} height={26} rx={5} className={art.vaultGlow} style={{ fill: "var(--c-ok)" }} opacity={0.25} />
      <rect x={-15} y={-11} width={30} height={22} rx={3} strokeWidth={1.5} style={{ fill: "var(--c-panel-2)", stroke: "var(--c-ok)" }} />
      <circle r={6} fill="none" strokeWidth={1.5} style={{ stroke: "var(--c-ok)" }} />
      <path d="M0 -6V-3M0 3V6M-6 0H-3M3 0H6" strokeWidth={1.2} style={{ stroke: "var(--c-ok)" }} />
      <rect x={10} y={-6} width={2} height={12} rx={1} style={{ fill: "var(--c-ok)" }} />
    </g>
  );
}

/** Act 1: the queue's state is a RAM chip. Hit the queue and the chip cracks; everything in it is gone. */
function RamChip({ x, y, dead }: { x: number; y: number; dead: boolean }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {!dead && <rect x={-13} y={-11} width={26} height={22} rx={4} className={art.vaultGlow} style={{ fill: "var(--c-fault)" }} opacity={0.25} />}
      <rect x={-11} y={-9} width={22} height={18} rx={2} strokeWidth={1.5} style={{ fill: dead ? "#111317" : "var(--c-panel-2)", stroke: dead ? "var(--c-ghost)" : "var(--c-fault)" }} />
      {[-6, -2, 2, 6].map((d) => (
        <path key={d} d={`M${d} -12v3M${d} 9v3`} strokeWidth={1.5} style={{ stroke: dead ? "var(--c-ghost)" : "var(--c-fault)" }} />
      ))}
      {dead && <path d="M-8 -7 L-2 -1 L-5 2 L3 8" fill="none" strokeWidth={1.4} style={{ stroke: "var(--c-ink)" }} />}
    </g>
  );
}

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
  // Lights out while the server is down; the vault (Postgres) is not part of the server.
  const interior = down ? 0.35 : hub.starting ? 0.7 : 1;
  return (
    <Hit node="hub" label={hub.label} onHit={onHit}>
      <NodeFrame x={HUB.x} y={HUB.y} w={HUB.w} h={HUB.h} down={down} highlight={hub.starting} roof="straight" />
      <g opacity={interior}>
        <SvgText x={left + 14} y={top + 21} letterSpacing={1} weight={600}>
          {hub.label.toUpperCase()}
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
          </>
        )}
      </g>
      <SvgText x={right - 14} y={top + 21} textAnchor="end" tone={hub.up ? "dim" : hub.starting ? "gold" : "bad"} className={hub.starting ? art.pulse : undefined}>
        {hub.info}
      </SvgText>
      {!hub.lanes &&
        (temporal ? (
          <g>
            <Vault x={right - 29} y={HUB_IN.timerY} />
            <SvgText x={right - 52} y={HUB_IN.timerY + 4} size={10.5} textAnchor="end" tone={down ? "good" : "dim"}>
              history in Postgres
            </SvgText>
          </g>
        ) : (
          <g>
            <RamChip x={right - 27} y={HUB_IN.timerY} dead={down} />
            <SvgText x={right - 46} y={HUB_IN.timerY + 4} size={10.5} textAnchor="end" tone="bad">
              {down ? "in memory · wiped" : "in memory · wiped on crash"}
            </SvgText>
          </g>
        ))}
      {down && hub.downLeftMs > 0 && (
        <text x={HUB.x} y={HUB.y + 16} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={44} style={{ fill: "var(--c-fault)" }}>
          {Math.ceil(hub.downLeftMs / 1000)}s
        </text>
      )}
    </Hit>
  );
}

export function SideNode({ side, onHit, onResume }: { side: SideView; onHit: (n: NodeId) => void; onResume: (id: string) => void }) {
  const left = SIDE.x - SIDE.w / 2;
  const top = SIDE.y - SIDE.h / 2;
  const dlq = side.kind === "dlq";
  return (
    <g>
      <Hit node="side" label={dlq ? "Dead-letter queue" : "Paused orders"} onHit={onHit}>
        <NodeFrame x={SIDE.x} y={SIDE.y} w={SIDE.w} h={SIDE.h} />
        {!dlq && (
          <g transform={`translate(${left + 10},${top + 9})`}>
            <PauseHandIcon size={14} />
          </g>
        )}
        <SvgText x={left + (dlq ? 12 : 28)} y={top + 20} size={11} letterSpacing={1} tone="gold">
          {dlq ? "DEAD LETTERS" : "PAUSED"}
        </SvgText>
        {[0, 1, 2].map((r) => (
          <line key={r} x1={left + 8} x2={left + SIDE.w - 8} y1={top + 52 + r * 22} y2={top + 52 + r * 22} strokeWidth={2} style={{ stroke: "var(--c-line)" }} />
        ))}
        <SvgText x={left + SIDE.w - 12} y={top + 20} textAnchor="end" tone="gold">
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
  const pet = PETS[card.id];
  const left = cx - WORKER.w / 2;
  const top = WORKER.top;
  return (
    <Hit node={`w:${card.id}`} label={`Worker ${workerName(card.id)}`} onHit={onHit}>
      <NodeFrame x={cx} y={top + WORKER.h / 2} w={WORKER.w} h={WORKER.h} down={!card.up} />
      <PetSprite species={pet.species} color={pet.color} pose={petPose(card)} x={cx} y={top + 6} downLeftMs={card.downLeftMs} downTotalMs={HAMMER_MS} />
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
