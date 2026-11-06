"use client";

import { useEffect, useRef, useState } from "react";
import { api, WS_URL } from "./api";
import type { Snapshot } from "./snapshot";
import type { SparkView } from "../types";

export interface LiveState {
  snapshot: Snapshot | null;
  offset: number; // server clock - browser clock, ms
  connected: boolean;
  sparks: { id: string; worker: number; bad: boolean; at: number }[]; // at = server ms
}

/**
 * Streams controller snapshots over a WebSocket (reconnecting on its own) and
 * tells the controller which step is on screen.
 */
export function useLive(step: number, enabled: boolean): LiveState {
  const [state, setState] = useState<LiveState>({ snapshot: null, offset: 0, connected: false, sparks: [] });
  const prev = useRef<Snapshot | null>(null);

  // Tell the backend which step is showing (it stops load on Act 1 steps).
  useEffect(() => {
    void api.step(step);
  }, [step]);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        const s = JSON.parse(ev.data as string) as Snapshot;
        const p = prev.current;
        prev.current = s;
        setState((st) => {
          let sparks = st.sparks.filter((x) => s.now - x.at < 400);
          if (p) {
            const moved = s.payments.charges + s.payments.deduped - (p.payments.charges + p.payments.deduped);
            const failed = s.payments.failures - p.payments.failures;
            if (moved > 0 || failed > 0) {
              const charging = p.orders.find((o) => o.status === "running" && o.current === 1);
              sparks = [...sparks, { id: `${s.now}`, worker: charging?.worker ?? 0, bad: failed > 0, at: s.now }];
            }
          }
          return { snapshot: s, offset: s.now - Date.now(), connected: true, sparks };
        });
      };
      ws.onclose = () => {
        setState((st) => ({ ...st, connected: false }));
        if (!closed) retry = setTimeout(connect, 1000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [enabled]);

  return state;
}

export const sparkViews = (sparks: LiveState["sparks"], serverNow: number): SparkView[] =>
  sparks.map((s) => ({ id: s.id, worker: s.worker, bad: s.bad, age: serverNow - s.at }));
