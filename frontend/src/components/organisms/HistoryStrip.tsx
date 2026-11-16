"use client";

import { useEffect, useState } from "react";
import { chipText, chipTone, nextHistory, type HistState } from "@/lib/history";
import { api } from "@/lib/live/api";
import styles from "./organisms.module.css";

const POLL_MS = 700;
const MAX_CHIPS = 14;

interface Props {
  /** The selected order's workflow id; polling runs only while there is one. */
  orderId: string | null;
  /** Pet name of the worker that just rebuilt this workflow from history, while that report is fresh. */
  replayedBy?: string;
  /** When that replay happened (server ms); a new value restarts the sweep. */
  replayedAt?: number;
}

/** The selected order's real event history as chips, under the board. */
export function HistoryStrip({ orderId, replayedBy, replayedAt }: Props) {
  const [h, setH] = useState<HistState>({ id: null, events: [], base: 0 });

  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Next poll starts POLL_MS after the previous one settles, so a slow controller never piles up requests.
    const load = async () => {
      const list = await api.history(orderId);
      if (stop) return;
      setH((p) => nextHistory(p, orderId, list));
      timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  const shown = h.id === orderId ? h.events.slice(-MAX_CHIPS) : [];
  const prev = h.base;

  if (!orderId) return <div className={styles.history} data-empty>Select a parcel (V) to see its history</div>;
  return (
    <div className={styles.history} aria-label="Workflow history">
      {shown.map((e) => (
        <span key={e.id} className={styles.chip} data-tone={chipTone(e.kind)} data-new={prev > 0 && e.id > prev}>
          {chipText(e)}
        </span>
      ))}
      {replayedBy && (
        <>
          <i key={replayedAt} className={styles.sweep} aria-hidden />
          <span className={styles.replayTag}>replayed by {replayedBy}</span>
        </>
      )}
    </div>
  );
}
