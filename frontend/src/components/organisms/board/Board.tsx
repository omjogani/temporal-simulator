import { OrderDot, Spark, Wire } from "@/components/atoms/svg";
import { HUB, PAY, VIEW, WORKER, clientWire, sideWire, workerWire, type Pt } from "@/lib/geometry";
import type { PlacedDot } from "@/lib/motion/useDotMotion";
import type { ArenaView, NodeId } from "@/lib/types";
import { ClientNode, HubNode, PaymentsNode, SideNode, WorkerCard } from "./nodes";
import styles from "./board.module.css";

interface Props {
  view: ArenaView;
  dots: PlacedDot[];
  onHit: (node: NodeId) => void;
  onResume: (orderId: string) => void;
}

const sparkFrom = (worker: number): Pt => (worker ? [WORKER.xs[worker - 1] + WORKER.w / 2 - 20, WORKER.top] : [HUB.x + HUB.w / 2, HUB.y]);
const PAY_IN: Pt = [PAY.x - PAY.w / 2, PAY.y];

/** The whole arena drawing: wires, nodes, worker cards, moving orders. */
export function Board({ view, dots, onHit, onResume }: Props) {
  return (
    <svg className={styles.svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Clients, hub and workers with orders moving between them">
      <g>
        {[0, 1, 2, 3].map((i) => (
          <Wire key={`c${i}`} pts={clientWire(i)} />
        ))}
        {[1, 2, 3, 4].map((j) => (
          <Wire key={`w${j}`} pts={workerWire(j)} />
        ))}
        {view.side && <Wire pts={sideWire()} />}
        <line x1={HUB.x + HUB.w / 2} y1={HUB.y} x2={PAY_IN[0]} y2={PAY_IN[1]} strokeWidth={2} strokeDasharray="3 6" style={{ stroke: "var(--c-line)" }} />
      </g>

      {[0, 1, 2, 3].map((i) => (
        <ClientNode key={i} index={i} wide={view.hub.lanes} onHit={onHit} />
      ))}
      <HubNode hub={view.hub} onHit={onHit} />
      <PaymentsNode pay={view.payments} onHit={onHit} />
      {view.side && <SideNode side={view.side} onHit={onHit} onResume={onResume} />}
      {view.workers.map((w) => (
        <WorkerCard key={w.id} card={w} onHit={onHit} />
      ))}

      <g pointerEvents="none">
        {dots.map(({ dot, x, y, opacity }) => (
          <OrderDot
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
        {view.sparks.map((s) => (
          <Spark key={s.id} from={sparkFrom(s.worker)} to={PAY_IN} bad={s.bad} age={s.age} />
        ))}
      </g>
    </svg>
  );
}
