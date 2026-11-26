import Link from "next/link";
import { Button, Kbd, Switch, UrlPill } from "@/components/atoms";
import { SpeakerIcon, TOOL_ICONS } from "@/components/atoms/icons";
import { LaneBar, PolicyList, ScoreStat, SegmentedControl, ToolButton, WorkerRow } from "@/components/molecules";
import { ACTION_META, CLIENT_COLORS, STEPS, TOOL_META, neighbours, routeFor, sectionKeys, type StepConfig } from "@/lib/steps";
import type { ActionId, ArenaView, PanelsView, PaymentsView, SchedMode, ToolId } from "@/lib/types";
import styles from "./organisms.module.css";

export { Board } from "./board/Board";
export { CodeDrawer, CodePanel } from "./CodePanel";
export { HistoryStrip } from "./HistoryStrip";

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
  /** Act 1: the plain queue acks after processing. */
  ackAfter?: boolean;
  /** Act 1: the plain queue has a dead-letter queue. */
  dlqOn?: boolean;
  /** Act 1: orders parked in the dead-letter queue (Replay DLQ only shows when there are some). */
  dlqParked?: number;
  /** Toolbox tabs (step 1): the active section id and its setter. */
  section?: string;
  onSection?: (id: string) => void;
  frozen: boolean;
  onTool: (t: ToolId) => void;
  onAction: (a: ActionId) => void;
  onSched: (m: SchedMode) => void;
  onFreeze: () => void;
  /** Sound effects: muted by default; M toggles. */
  muted: boolean;
  onSound: () => void;
  /** Scene switch state (idiom scenes) and the click handler that sends it to the controller. */
  scene?: ArenaView["scene"];
  onSwitch?: (s: { idemKey?: boolean; build?: "good" | "bad" }) => void;
  /** Sub-mode of the error tool, shown on its tile. */
  errorMode?: string;
}

const payActive = (a: ActionId, p: PaymentsView) => ((a === "payDown" || a === "payDownLong") && p.state === "down") || (a === "paySlow" && p.state === "slow");

/** Fault buttons show their own countdown while active (there is no Payments box on the board). */
const actionLabel = (a: ActionId, p: PaymentsView) =>
  payActive(a, p) ? `${ACTION_META[a].label} · ${Math.ceil(p.leftMs / 1000)}s` : ACTION_META[a].label;

function ToolIcon({ tool }: { tool: ToolId }) {
  const Icon = TOOL_ICONS[TOOL_META[tool].icon];
  return <Icon size={20} />;
}

export function Toolbox({ step, tool, sched, payments, ackAfter, dlqOn, dlqParked, section, onSection, frozen, onTool, onAction, onSched, onFreeze, muted, onSound, scene, onSwitch, errorMode }: ToolboxProps) {
  // Steps with tabs show only the active tab's tools and actions; the rest stay one hotkey away.
  const active = step.sections?.find((s) => s.id === section) ?? step.sections?.[0];
  const tools = active ? (active.tools ?? []) : step.tools;
  const actions = active ? active.actions.filter((a) => a !== "replayDlq" || !!dlqParked) : step.actions;
  return (
    <div className={styles.toolbox} role="toolbar" aria-label="Tools">
      {step.sections && onSection && (
        <>
          <SegmentedControl<string> label="Section" value={active!.id} onChange={onSection} options={step.sections.map((s) => ({ value: s.id, label: s.label }))} />
          <span className={styles.hint} aria-label="Hotkeys of the other tabs">
            {step.sections
              .filter((s) => s.id !== active!.id)
              .map((s) => (
                <span key={s.id}>
                  {s.label} {sectionKeys(step, s.id).map((k) => <Kbd key={k}>{k}</Kbd>)}
                </span>
              ))}
          </span>
          <span className={styles.sep} />
        </>
      )}
      {tools.map((t) => (
        <ToolButton key={t} label={TOOL_META[t].label} hotkey={TOOL_META[t].key} pressed={tool === t} onClick={() => onTool(t)} icon={<ToolIcon tool={t} />} caption={t === "error" && errorMode ? `${TOOL_META[t].short} ${errorMode}` : TOOL_META[t].short} />
      ))}
      {tools.length > 0 && <span className={styles.sep} />}
      {actions.map((a) =>
        a === "sched" ? (
          <SegmentedControl<SchedMode>
            key={a}
            label="Scheduling"
            value={sched}
            onChange={onSched}
            options={[
              { value: "fifo", label: "FIFO" },
              { value: "priority", label: "Priority" },
              { value: "fair", label: "Priority + Fairness" },
            ]}
          />
        ) : (
          <ToolButton key={a} label={actionLabel(a, payments)} hotkey={ACTION_META[a].key} pressed={payActive(a, payments) || (a === "ackMode" && !!ackAfter) || (a === "dlq" && !!dlqOn)} onClick={() => onAction(a)} />
        ),
      )}
      {step.switches?.includes("idemKey") && scene && onSwitch && (
        <Switch label="Idempotency key" on={scene.idemKey} onLabel="Idempotency key ON" offLabel="Idempotency key OFF" onChange={(v) => onSwitch({ idemKey: v })} />
      )}
      {step.switches?.includes("build") && scene && onSwitch && (
        <Switch label="Deployed build" on={scene.build === "good"} onLabel="workflow.Now() ✓" offLabel="time.Now() ✗" onChange={(v) => onSwitch({ build: v ? "good" : "bad" })} />
      )}
      {!step.live && (
        <Button onClick={onFreeze}>
          {frozen ? "Unfreeze" : "Freeze"}
        </Button>
      )}
      <ToolButton label="Reset" hotkey="R" onClick={() => onAction("reset")} />
      <Button pressed={!muted} onClick={onSound} aria-label={muted ? "Sound off" : "Sound on"} title="Sound effects (M)">
        <SpeakerIcon size={15} muted={muted} />
        <Kbd>M</Kbd>
      </Button>
    </div>
  );
}

/** Previous / next arrows around the URL pill, (← → keys do the same). */
export function StepNav({ config }: { config: StepConfig }) {
  const nav = neighbours(config);
  const find = (href?: string) => STEPS.find((s) => routeFor(s) === href);
  const prev = find(nav.prev);
  const next = find(nav.next);
  return (
    <nav className={styles.stepNav} aria-label="Steps">
      <Link href={nav.prev ?? "#"} className={styles.nav} aria-label={prev ? `Previous: ${prev.name}` : "Previous step"} title={prev?.name} aria-disabled={!prev}>
        ←
      </Link>
      <UrlPill host="localhost:13000" path={routeFor(config).slice(1)} />
      <Link href={nav.next ?? "#"} className={styles.nav} aria-label={next ? `Next: ${next.name}` : "Next step"} title={next?.name} aria-disabled={!next}>
        →
      </Link>
    </nav>
  );
}

export function TryThis({ lines }: { lines: string[] }) {
  return (
    <div className={styles.caption}>
      <span className={styles.lbl}>Try this</span>
      {lines.length > 1 ? (
        <ol className={styles.beats}>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      ) : (
        <span>{lines[0]}</span>
      )}
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

export function ConnectionNotice() {
  return (
    <div className={`${styles.card} ${styles.notice}`} role="status">
      <h5>Backend not connected</h5>
      <p>Steps 2–5 run on real Temporal through the Go controller. Start them with:</p>
      <p>
        <code>docker compose up -d</code>
        <br />
        <code>cd backend &amp;&amp; go run ./cmd/sim controller</code>
      </p>
      <p>This page reconnects on its own.</p>
    </div>
  );
}
