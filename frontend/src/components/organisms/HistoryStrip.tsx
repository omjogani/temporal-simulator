"use client";

import { useEffect, useState } from "react";
import { chipText, chipTone } from "@/lib/history";
import { api, type HistEvent } from "@/lib/live/api";
import styles from "./organisms.module.css";

const POLL_MS = 700;
const MAX_CHIPS = 14;

interface Props {
  /** The selected order's workflow id; polling runs only while there is one. */
  orderId: string | null;
  /** Pet name of the worker that just rebuilt this workflow from history, while that report is fresh. */
  replayedBy?: string;
}

/** The selected order's real event history as chips, under the board. */
export function HistoryStrip({ orderId, replayedBy }: Props) {
  // `base` is the newest event id before the latest poll, so chips past it slide in (nothing slides on the first load).
  const [h, setH] = useState<{ id: string | null; events: HistEvent[]; base: number }>({ id: null, events: [], base: 0 });

  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    const load = async () => {
      const list = await api.history(orderId);
      if (stop) return;
      setH((p) => {
        const had = p.id === orderId && p.events.length > 0;
        return { id: orderId, events: list, base: had ? p.events[p.events.length - 1].id : 0 };
      });
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
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
          <i className={styles.sweep} aria-hidden />
          <span className={styles.replayTag}>replayed by {replayedBy}</span>
        </>
      )}
    </div>
  );
}
