// Live snapshot → shared view model.

import { HUB_IN } from "../geometry";
import { COMP_NAME, SCORE_META, STEP_NAMES, type StepConfig } from "../steps";
import type {
  ArenaView,
  ChecklistRowView,
  DotView,
  LaneView,
  ScoreItemView,
  ScoreKey,
  SparkView,
  WorkerCardView,
} from "../types";
import type { SnapOrder, SnapStep, Snapshot } from "./snapshot";

const secs = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;
const LANE_LABELS = ["C1 VIP", "C2", "C3", "C4 bulk"];

function row(st: SnapStep, i: number, now: number, temporalUp: boolean, ghost: boolean): ChecklistRowView {
  const label = i < STEP_NAMES.length ? STEP_NAMES[i] : COMP_NAME;
  const comp = i >= STEP_NAMES.length;
  switch (st.state) {
    case "done":
      return { label, state: "done", comp };
    case "reporting":
      return { label, state: "reporting", comp, meta: temporalUp ? undefined : "on hold", metaTone: "gold" };
    case "running": {
      const progress = st.startedAt && st.durationMs ? Math.min(1, (now - st.startedAt) / st.durationMs) : 0;
      return { label, state: ghost ? "interrupted" : "running", comp, progress, meta: st.attempt > 1 ? `attempt ${st.attempt}` : undefined, metaTone: "gold" };
    }
    case "backoff":
      return { label, state: "backoff", comp, meta: `retry in ${secs((st.nextRetryAt ?? now) - now)}`, metaTone: "gold" };
    case "interrupted":
      return { label, state: "interrupted", comp, meta: "will retry", metaTone: "gold" };
    case "failed":
      return { label, state: "failed", comp, meta: st.error ?? "failed", metaTone: "bad" };
    case "skipped":
      return { label, state: "skipped", comp, meta: "skipped", metaTone: "dim" };
    default:
      return { label, state: "pending", comp };
  }
}

const placeholder = (): ChecklistRowView[] => STEP_NAMES.map((label) => ({ label, state: "placeholder" }));
const doneCount = (o: SnapOrder) => o.steps.slice(0, 4).filter((s) => s.state === "done" || s.state === "reporting").length;

export function liveView(s: Snapshot, cfg: StepConfig, now: number, sparks: SparkView[], connected: boolean): ArenaView {
  const tUp = s.temporal.up;
  const tLeft = s.temporal.downUntil - now;

  const workers: WorkerCardView[] = s.workers.map((w) => {
    const running = s.orders.find((o) => o.status === "running" && o.worker === w.id);
    const ghostOrder = running ? undefined : s.orders.find((o) => o.status === "interrupted" && o.worker === w.id);
    const o = running ?? ghostOrder;
    const ghost = !!ghostOrder;
    const down = !w.up;
    let status = "idle";
    let statusTone: WorkerCardView["statusTone"] = "dim";
    if (down) {
      status = w.downUntil > now ? `DOWN · ${secs(w.downUntil - now)}` : "starting…";
      statusTone = "bad";
    } else if (running) {
      status = "running";
      statusTone = "good";
    } else if (!tUp) {
      status = "no server";
      statusTone = "gold";
    }
    return {
      id: w.id,
      up: !down,
      downLeftMs: Math.max(0, w.downUntil - now),
      status,
      statusTone,
      orderLabel: o ? `Order #${o.num}${ghost ? " · saved" : ""}${o.pauseRequested ? " · pausing…" : ""}` : undefined,
      orderTone: ghost ? "dim" : o?.pauseRequested ? "gold" : "neutral",
      ghost,
      rows: o ? o.steps.map((st, i) => row(st, i, now, tUp, ghost)) : placeholder(),
      footer: `✓ ${w.completed} orders completed`,
    };
  });

  // Dots
  const dots: DotView[] = [];
  const holdSlot = [0, 0, 0, 0];
  const laneSlot = [0, 0, 0, 0];
  let hubSlot = 0;
  let timerSlot = 0;
  let waiting = 0;
  let retrying = 0;
  const paused: SnapOrder[] = [];
  for (const o of s.orders) {
    const ring = o.charged > 0 ? "charged" : "none";
    const base = { id: o.id, client: o.client, declined: o.declined };
    switch (o.status) {
      case "holding":
        dots.push({ ...base, loc: { kind: "client", client: o.client, slot: holdSlot[o.client]++ }, ring });
        break;
      case "queued":
      case "finishing":
      case "backoff": {
        if (o.status === "backoff") retrying++;
        else waiting++;
        const st = o.steps[o.current];
        const isRetry = o.status === "backoff";
        // A retrying activity is not in the task queue: Temporal holds it as a timer
        // and only puts it back on the queue when the backoff runs out.
        const loc = cfg.lanes
          ? { kind: "hub" as const, slot: laneSlot[o.client]++, lane: o.client }
          : isRetry
            ? { kind: "hub" as const, slot: timerSlot++, timer: true }
            : { kind: "hub" as const, slot: hubSlot++ };
        dots.push({
          ...base,
          loc,
          ring: isRetry ? "retry" : ring,
          label: isRetry && st?.nextRetryAt ? secs(st.nextRetryAt - now) : undefined,
          hidden: loc.slot >= (cfg.lanes ? HUB_IN.laneCells : isRetry ? HUB_IN.timers : HUB_IN.cells),
        });
        break;
      }
      case "running":
        dots.push({ ...base, loc: { kind: "worker", worker: o.worker }, ring });
        break;
      case "interrupted":
        dots.push({ ...base, loc: { kind: "worker", worker: o.worker }, ring: "ghost", ghost: true });
        break;
      case "paused":
        paused.push(o);
        dots.push({ ...base, loc: { kind: "side", slot: paused.length - 1 }, ring, hidden: true });
        break;
      case "completed":
        dots.push({ ...base, loc: { kind: "gone" }, ring: "done", fate: "done" });
        break;
      case "failed":
        dots.push({ ...base, loc: { kind: "gone" }, ring: "failed", fate: "failed" });
        break;
      case "lost":
        dots.push({ ...base, loc: { kind: "gone" }, ring: "none", fate: "lost" });
        break;
    }
  }

  const values: Record<ScoreKey, number> = {
    done: s.stats.done,
    inflight: s.stats.inflight,
    lost: s.stats.lost,
    dup: s.stats.duplicates,
    dlq: 0,
    failed: s.stats.failed,
    paused: s.stats.paused,
  };
  const score: ScoreItemView[] = cfg.score.map((k) => {
    const v = values[k];
    const zeroWin = (k === "lost" || k === "dup") && v === 0;
    return {
      key: k,
      label: SCORE_META[k].label,
      value: v,
      tone: zeroWin ? "good" : v || k === "done" ? SCORE_META[k].tone : "neutral",
      note: zeroWin ? "still 0" : undefined,
    };
  });

  const r = s.retry;
  const backoffSteps: number[] = [];
  let d = r.initialMs;
  for (let i = 0; i < 4; i++) {
    backoffSteps.push(d / 1000);
    d = r.maxMs ? Math.min(r.maxMs, d * r.coefficient) : d * r.coefficient;
  }
  const lanes: LaneView[] | undefined = cfg.lanes
    ? [0, 1, 2, 3].map((c) => ({ client: c, label: LANE_LABELS[c], ms: s.waits[c] ?? 0, done: s.clientDone?.[c] ?? 0 }))
    : undefined;

  const payDown = s.payments.downUntil > now;
  const paySlow = s.payments.slowUntil > now;

  return {
    hub: {
      label: cfg.hub,
      up: tUp,
      downLeftMs: Math.max(0, tLeft),
      starting: !tUp && tLeft <= 0,
      info: !tUp ? (tLeft > 0 ? `DOWN · ${secs(tLeft)}` : "starting…") : `waiting ${waiting}${retrying ? ` · retrying ${retrying}` : ""}`,
      more: !cfg.lanes && waiting > HUB_IN.cells ? `+${waiting - HUB_IN.cells} more` : undefined,
      lanes: cfg.lanes,
      store: "history",
    },
    payments: {
      state: payDown ? "down" : paySlow ? "slow" : "ok",
      leftMs: Math.max(0, (payDown ? s.payments.downUntil : s.payments.slowUntil) - now),
      info: payDown
        ? `500s · ${secs(s.payments.downUntil - now)}`
        : paySlow
          ? `slow 5s · ${secs(s.payments.slowUntil - now)}`
          : `charges ${s.payments.charges}${s.payments.deduped ? ` · deduped ${s.payments.deduped}` : ""}`,
      flash: sparks.some((x) => x.age < 220 && !x.bad),
    },
    side:
      cfg.side === "paused"
        ? { kind: "paused", count: paused.length, chips: paused.map((o) => ({ id: o.id, client: o.client, label: `#${o.num} ${doneCount(o)}/4 ▶` })) }
        : null,
    workers,
    dots,
    sparks,
    panels: {
      workers: s.workers.map((w) => ({
        id: w.id,
        up: w.up,
        note: !w.up ? (w.downUntil > now ? `down · ${secs(w.downUntil - now)}` : "starting…") : workers[w.id - 1]?.status === "running" ? "busy" : "idle",
        noteTone: w.up ? "dim" : "bad",
        completed: w.completed,
      })),
      service: { label: "Temporal Service", up: tUp, note: tUp ? "●" : tLeft > 0 ? secs(tLeft) : "starting…" },
      retry:
        cfg.id === 4
          ? {
              startToClose: `${s.startToCloseMs / 1000}s`,
              backoff: backoffSteps.join("→") + "s",
              maxAttempts: r.maxAttempts ? String(r.maxAttempts) : "∞",
              nonRetryable: "CardDeclined",
            }
          : undefined,
      lanes,
      score,
    },
    banner: s.banner,
    connected,
    sched: s.sched,
    temporalUi: s.temporalUi,
  };
}

/** Placeholder shown before the first snapshot arrives. */
export function emptyLiveView(cfg: StepConfig, connected: boolean): ArenaView {
  return {
    hub: { label: cfg.hub, up: false, downLeftMs: 0, starting: true, info: "connecting…", lanes: cfg.lanes, store: "history" },
    payments: { state: "ok", leftMs: 0, info: "charges 0", flash: false },
    side: cfg.side === "paused" ? { kind: "paused", count: 0, chips: [] } : null,
    workers: [1, 2, 3, 4].map((id) => ({ id, up: false, downLeftMs: 0, status: "…", statusTone: "dim", ghost: false, rows: placeholder(), footer: "" })),
    dots: [],
    sparks: [],
    panels: {
      workers: [1, 2, 3, 4].map((id) => ({ id, up: false, note: "connecting", noteTone: "dim", completed: 0 })),
      service: { label: "Temporal Service", up: false, note: "…" },
      score: cfg.score.map((k) => ({ key: k, label: SCORE_META[k].label, value: 0, tone: "neutral" })),
    },
    banner: { seq: 0, text: "" },
    connected,
    sched: "fifo",
  };
}
