import Link from "next/link";
import { BigNumber, Button, Kbd, StatusDot } from "@/components/atoms";
import type { LaneView, RetryPolicyView, ScoreItemView, WorkerRowView } from "@/lib/types";
import styles from "./molecules.module.css";

export function ToolButton({ label, hotkey, pressed, onClick }: { label: string; hotkey?: string; pressed?: boolean; onClick: () => void }) {
  return (
    <Button pressed={pressed} onClick={onClick}>
      {label}
      {hotkey && <Kbd>{hotkey}</Kbd>}
    </Button>
  );
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <span className={styles.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** Visualization speed: a stepped range input with the current value. */
export function SpeedSlider({ value, stops, onChange }: { value: number; stops: readonly number[]; onChange: (v: number) => void }) {
  const index = Math.max(0, stops.indexOf(value));
  return (
    <label className={styles.speed}>
      <span>Speed</span>
      <input
        id="speed"
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        aria-valuetext={`${value}x`}
        onChange={(e) => onChange(stops[Number(e.target.value)])}
      />
      <output htmlFor="speed">{value}×</output>
      <Kbd>- / +</Kbd>
    </label>
  );
}

export function WorkerRow({ row }: { row: WorkerRowView }) {
  return (
    <div className={styles.workerRow}>
      <StatusDot up={row.up} />
      <span>Worker {row.id}</span>
      <em data-tone={row.noteTone}>{row.note}</em>
      <BigNumber value={row.completed} size="sm" />
    </div>
  );
}

export function ScoreStat({ item }: { item: ScoreItemView }) {
  return (
    <div className={styles.score}>
      <BigNumber value={item.value} tone={item.tone} />
      <span>
        {item.label}
        {item.note ? ` · ${item.note}` : ""}
      </span>
    </div>
  );
}

export function LaneBar({ lane, max, color }: { lane: LaneView; max: number; color: string }) {
  return (
    <div className={styles.lane}>
      <span style={{ color }}>{lane.label}</span>
      <span className={styles.bar}>
        <i style={{ width: `${Math.min(100, (lane.ms / max) * 100).toFixed(0)}%`, background: color }} />
      </span>
      <b>{(lane.ms / 1000).toFixed(1)}s</b>
      <small>{lane.done} done</small>
    </div>
  );
}

export function PolicyList({ policy }: { policy: RetryPolicyView }) {
  const rows: [string, string][] = [
    ["start-to-close", policy.startToClose],
    ["backoff", policy.backoff],
    ["max attempts", policy.maxAttempts],
    ["non-retryable", policy.nonRetryable],
  ];
  return (
    <div className={styles.policy}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          {v}
        </div>
      ))}
    </div>
  );
}

export function StepRailItem({ id, act, name, current }: { id: number; act: 1 | 2; name: string; current: boolean }) {
  return (
    <Link href={`/${id}`} className={styles.railItem} data-act={act} aria-current={current ? "step" : undefined}>
      <small>{act === 1 ? "Queue" : "Temporal"}</small>
      <b>/{id}</b>
      {name}
    </Link>
  );
}
