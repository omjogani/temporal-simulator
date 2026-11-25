import type { SnapOrder } from "./live/snapshot";
import type { CodeAnchor } from "./steps";

const BY_STEP: CodeAnchor[] = ["reserve", "charge", "ship", "email"];
const COMP_STEP = 4;
const LATE_SCENE = 105;

/** The code line the selected order is on right now (undefined when nothing is selected or it is not in a step). */
export function activeAnchor(order: SnapOrder | undefined, now: number, sceneId: number): CodeAnchor | undefined {
  if (!order) return undefined;
  if (order.waitUntil > now) return "courier";
  const comp = order.steps[COMP_STEP];
  if (comp && (comp.state === "running" || comp.state === "reporting" || comp.state === "backoff")) return "cleanup";
  const a = BY_STEP[order.current];
  if (a === "ship" && sceneId === LATE_SCENE && order.express) return "late";
  return a;
}
