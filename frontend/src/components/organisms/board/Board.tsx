import { Parcel } from "@/components/atoms/Parcel";
import { Wire } from "@/components/atoms/svg";
import { VIEW, clientWire, sideWire, workerWire } from "@/lib/geometry";
import type { XY } from "@/lib/fx/effects";
import type { PlacedDot } from "@/lib/motion/useDotMotion";
import { SpeechBubble } from "@/components/molecules/SpeechBubble";
import type { ArenaView, NodeId, Tone } from "@/lib/types";
import { ClientNode, Hit, HubNode, SideNode, WorkerCard } from "./nodes";
import styles from "./board.module.css";

interface Props {
  view: ArenaView;
  dots: PlacedDot[];
  onHit: (node: NodeId) => void;
  onResume: (orderId: string) => void;
  /** Screen-shake offset in board units. */
  shake?: XY;
  /** Parcels are clickable (the current tool acts on a parcel). */
  parcelTool?: boolean;
  selected?: string | null;
  /** Reply to the presenter's last click on a parcel, in board units. */
  bubble?: { x: number; y: number; text: string; tone: Tone } | null;
}

/** The whole arena drawing: wires, nodes, worker cards, moving orders. */
export function Board({ view, dots, onHit, onResume, shake, parcelTool, selected, bubble }: Props) {
  return (
    <svg className={styles.svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="Clients, hub and workers with orders moving between them">
      <g transform={shake && (shake.x || shake.y) ? `translate(${shake.x.toFixed(2)} ${shake.y.toFixed(2)})` : undefined}>
      <g>
        {[0, 1, 2, 3].map((i) => (
          <Wire key={`c${i}`} pts={clientWire(i)} moving={view.hub.up} />
        ))}
        {[1, 2, 3, 4].map((j) => (
          <Wire key={`w${j}`} pts={workerWire(j)} moving={view.hub.up} />
        ))}
        {view.side && <Wire pts={sideWire()} moving={view.hub.up} />}
      </g>

      {[0, 1, 2, 3].map((i) => (
        <ClientNode key={i} index={i} wide={view.hub.lanes} onHit={onHit} />
      ))}
      <HubNode hub={view.hub} onHit={onHit} />
      {view.side && <SideNode side={view.side} onHit={onHit} onResume={onResume} />}
      {view.workers.map((w) => (
        <WorkerCard key={w.id} card={w} onHit={onHit} />
      ))}

      <g pointerEvents={parcelTool ? undefined : "none"}>
        {dots.map(({ dot, x, y, opacity }) => {
          const parcel = (
            <Parcel
              key={dot.id}
              x={x}
              y={y}
              client={dot.client}
              ring={dot.ring}
              opacity={opacity}
              ghost={dot.ghost}
              declined={dot.declined}
              lost={dot.fate === "lost"}
              canceled={dot.fate === "canceled"}
              label={dot.label}
              bow={dot.bow}
              tag={dot.tag}
              selected={selected === dot.id}
            />
          );
          if (!parcelTool || dot.hidden) return parcel;
          return (
            <Hit key={dot.id} node={`o:${dot.id}`} label={`Order ${dot.id}`} onHit={onHit}>
              <circle cx={x} cy={y} r={14} fill="transparent" />
              {parcel}
            </Hit>
          );
        })}
      </g>
      {bubble && <SpeechBubble {...bubble} />}
      </g>
    </svg>
  );
}
