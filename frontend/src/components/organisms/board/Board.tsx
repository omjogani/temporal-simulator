import { Parcel } from "@/components/atoms/Parcel";
import { Wire } from "@/components/atoms/svg";
import { VIEW, clientWire, sideWire, workerWire } from "@/lib/geometry";
import type { XY } from "@/lib/fx/effects";
import type { PlacedDot } from "@/lib/motion/useDotMotion";
import type { ArenaView, NodeId } from "@/lib/types";
import { ClientNode, HubNode, SideNode, WorkerCard } from "./nodes";
import styles from "./board.module.css";

interface Props {
  view: ArenaView;
  dots: PlacedDot[];
  onHit: (node: NodeId) => void;
  onResume: (orderId: string) => void;
  /** Screen-shake offset in board units. */
  shake?: XY;
}

/** The whole arena drawing: wires, nodes, worker cards, moving orders. */
export function Board({ view, dots, onHit, onResume, shake }: Props) {
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

      <g pointerEvents="none">
        {dots.map(({ dot, x, y, opacity }) => (
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
            label={dot.label}
          />
        ))}
      </g>
      </g>
    </svg>
  );
}
