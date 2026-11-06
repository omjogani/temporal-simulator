import Link from "next/link";
import { Button, Kbd } from "@/components/atoms";
import { LaneBar, PolicyList, ScoreStat, SegmentedControl, StepRailItem, ToolButton, WorkerRow } from "@/components/molecules";
import { ACTION_META, CLIENT_COLORS, STEPS, TOOL_META, type StepConfig } from "@/lib/steps";
import type { ActionId, PanelsView, PaymentsView, SchedMode, ToolId } from "@/lib/types";
import styles from "./organisms.module.css";

export { Board } from "./board/Board";

/** Left scoreboard: one row per worker (orders completed), plus the step's one extra fact. */
export function WorkersPanel({ panels }: { panels: PanelsView }) {
  const max = Math.max(8000, ...(panels.lanes?.map((l) => l.ms) ?? [0]));
  return (
    <aside className={styles.panel} aria-label="Workers">
      <h4>Workers</h4>
      {panels.workers.map((w) => (
        <WorkerRow key={w.id} row={w} />
      ))}
      <h4>{panels.service.label}</h4>
      <div className={styles.svc} data-up={panels.service.up}>
        <span>{panels.service.up ? "up" : "down"}</span>
        <span>{panels.service.note}</span>
      </div>
      {panels.retry && (
        <>
          <h4>Retry policy</h4>
          <PolicyList policy={panels.retry} />
        </>
      )}
      {panels.lanes && (
        <>
          <h4>Time to finish, by client</h4>
          {panels.lanes.map((l) => (
            <LaneBar key={l.client} lane={l} max={max} color={CLIENT_COLORS[l.client]} />
          ))}
        </>
      )}
    </aside>
  );
}

/** Right scoreboard: the few order counts that matter for this step. */
export function OrdersPanel({ panels }: { panels: PanelsView }) {
  return (
    <aside className={styles.panel} aria-label="Orders">
      <h4>Orders</h4>
      {panels.score.map((s) => (
        <ScoreStat key={s.key} item={s} />
      ))}
    </aside>
  );
}

interface ToolboxProps {
  step: StepConfig;
  tool: ToolId;
  sched: SchedMode;
  payments: PaymentsView;
  frozen: boolean;
  onTool: (t: ToolId) => void;
  onAction: (a: ActionId) => void;
  onSched: (m: SchedMode) => void;
  onFreeze: () => void;
}

const payActive = (a: ActionId, p: PaymentsView) => (a === "payDown" && p.state === "down") || (a === "paySlow" && p.state === "slow");

/** Fault buttons show their own countdown while active (there is no Payments box on the board). */
const actionLabel = (a: ActionId, p: PaymentsView) =>
  payActive(a, p) ? `${ACTION_META[a].label} · ${Math.ceil(p.leftMs / 1000)}s` : ACTION_META[a].label;

export function Toolbox({ step, tool, sched, payments, frozen, onTool, onAction, onSched, onFreeze }: ToolboxProps) {
  return (
    <div className={styles.toolbox} role="toolbar" aria-label="Tools">
      {step.tools.map((t) => (
        <ToolButton key={t} label={TOOL_META[t].label} hotkey={TOOL_META[t].key} pressed={tool === t} onClick={() => onTool(t)} />
      ))}
      <span className={styles.sep} />
      {step.actions.map((a) =>
        a === "sched" ? (
          <SegmentedControl<SchedMode>
            key={a}
            label="Scheduling"
            value={sched}
            onChange={onSched}
            options={[
              { value: "fifo", label: "FIFO" },
              { value: "priority", label: "Priority" },
              { value: "fair", label: "Fairness" },
            ]}
          />
        ) : (
          <ToolButton key={a} label={actionLabel(a, payments)} hotkey={ACTION_META[a].key} pressed={payActive(a, payments)} onClick={() => onAction(a)} />
        ),
      )}
      {!step.live && (
        <Button onClick={onFreeze}>
          {frozen ? "Unfreeze" : "Freeze"} <Kbd>␣</Kbd>
        </Button>
      )}
      <ToolButton label="Reset" hotkey="R" onClick={() => onAction("reset")} />
    </div>
  );
}

export function StepRail({ current }: { current: number }) {
  const prev = current > 1 ? `/${current - 1}` : null;
  const next = current < STEPS.length ? `/${current + 1}` : null;
  return (
    <nav className={styles.rail} aria-label="Steps">
      <Link href={prev ?? "#"} className={styles.nav} aria-label="Previous step" aria-disabled={!prev}>
        ←
      </Link>
      {STEPS.map((s) => (
        <StepRailItem key={s.id} id={s.id} act={s.act} name={s.name} current={s.id === current} />
      ))}
      <Link href={next ?? "#"} className={styles.nav} aria-label="Next step" aria-disabled={!next}>
        →
      </Link>
    </nav>
  );
}

export function TryThis({ text }: { text: string }) {
  return (
    <div className={styles.caption}>
      <span className={styles.lbl}>Try this</span>
      <span>{text}</span>
    </div>
  );
}

export function BannerLine({ text }: { text: string }) {
  return (
    <div className={styles.banner} aria-live="polite">
      {text}
    </div>
  );
}

export function RecapCard({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Hide recap">
        hide ✕
      </button>
      <h5>What we built for a queue</h5>
      <ul>
        <li className={styles.y}>A durable broker to run and monitor</li>
        <li className={styles.y}>Acks and a visibility timeout to tune</li>
        <li className={styles.y}>A retry policy</li>
        <li className={styles.y}>A dead-letter queue, and someone to drain it</li>
        <li className={styles.n}>Resuming from the step that failed (we restart from zero)</li>
        <li className={styles.n}>Idempotency keys on every side effect</li>
        <li className={styles.n}>Undoing earlier steps when a later one fails</li>
        <li className={styles.n}>An answer to “where is order #42 right now?”</li>
      </ul>
      <p>Next: the same board, with real Temporal in the middle.</p>
    </div>
  );
}

export function ConnectionNotice() {
  return (
    <div className={`${styles.card} ${styles.notice}`} role="status">
      <h5>Backend not connected</h5>
      <p>Steps 3–6 run on real Temporal through the Go controller. Start them with:</p>
      <p>
        <code>docker compose up -d</code>
        <br />
        <code>cd backend &amp;&amp; go run ./cmd/sim controller</code>
      </p>
      <p>This page reconnects on its own.</p>
    </div>
  );
}
