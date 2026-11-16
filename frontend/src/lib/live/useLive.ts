"use client";

import { useEffect, useState } from "react";
import { api, WS_URL } from "./api";
import type { Snapshot } from "./snapshot";

export interface LiveState {
  snapshot: Snapshot | null;
  offset: number; // server clock - browser clock, ms
  connected: boolean;
}

/**
 * Streams controller snapshots over a WebSocket (reconnecting on its own) and
 * tells the controller which step is on screen.
 */
export function useLive(step: number, enabled: boolean): LiveState {
  const [state, setState] = useState<LiveState>({ snapshot: null, offset: 0, connected: false });

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
        setState({ snapshot: s, offset: s.now - Date.now(), connected: true });
      };
      ws.onclose = () => {
        setState((st) => ({ ...st, connected: false }));
        if (!closed) retry = setTimeout(connect, 1000);
      };
      ws.onerror = () => ws?.close();
    };
    // Deferred so React strict mode's mount → unmount → mount never closes a socket
    // that is still connecting (the browser warns about that).
    const start = setTimeout(connect, 0);
    return () => {
      closed = true;
      clearTimeout(start);
      clearTimeout(retry);
      ws?.close();
    };
  }, [enabled]);

  return state;
}
