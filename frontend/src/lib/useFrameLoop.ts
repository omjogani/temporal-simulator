"use client";

import { useEffect, useRef, useState } from "react";

export interface FrameTime {
  now: number; // performance.now() of this frame
  wall: number; // Date.now() of this frame
}

/**
 * Re-renders on every animation frame and calls `onFrame(dt)` first.
 * Clock reads happen here, outside render, so components stay pure.
 */
export function useFrameLoop(onFrame?: (dt: number) => void): FrameTime {
  const [time, setTime] = useState<FrameTime>({ now: 0, wall: 0 });
  const cb = useRef(onFrame);
  useEffect(() => {
    cb.current = onFrame;
  });
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      cb.current?.(dt);
      setTime({ now: t, wall: Date.now() });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return time;
}
