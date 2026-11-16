"use client";

import { useRef, type ReactNode } from "react";
import { TOOL_ICONS } from "@/components/atoms/icons";
import { TOOL_META } from "@/lib/steps";
import type { ToolId } from "@/lib/types";
import styles from "./fx.module.css";

const ICON = 40;
// Where the pointer sits inside the icon (on the hammer head / the palm), and the
// pivot the click animation turns around (the hammer's handle end / the wrist).
const HOT: Record<ToolId, { x: number; y: number }> = {
  hammer: { x: 9, y: 9 },
  pause: { x: 20, y: 14 },
  select: { x: 8, y: 5 },
  error: { x: 15, y: 32 },
  signal: { x: 36, y: 5 },
  query: { x: 16, y: 16 },
  update: { x: 6, y: 34 },
  cancel: { x: 20, y: 20 },
  freeze: { x: 20, y: 20 },
};
const PIVOT: Record<ToolId, string> = {
  hammer: "34px 34px",
  pause: "20px 36px",
  select: "8px 5px",
  error: "20px 20px",
  signal: "20px 20px",
  query: "20px 20px",
  update: "6px 34px",
  cancel: "20px 20px",
  freeze: "20px 20px",
};

/**
 * Wraps the board: over it the mouse pointer becomes the current tool, which swings on
 * click. Touch and pen keep the normal behaviour. Position updates write a transform on
 * a ref; nothing re-renders per mouse move.
 */
export function ToolCursor({ tool, children }: { tool: ToolId; children: ReactNode }) {
  const icon = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const icon_ = TOOL_META[tool].icon;
  const Icon = TOOL_ICONS[icon_];
  const hot = HOT[icon_];

  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !icon.current || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    // getBoundingClientRect is in zoomed px when the page uses CSS zoom; offsetWidth is not.
    const k = wrap.current.offsetWidth / r.width || 1;
    const x = (e.clientX - r.left) * k - hot.x;
    const y = (e.clientY - r.top) * k - hot.y;
    icon.current.style.transform = `translate(${x}px, ${y}px)`;
    icon.current.dataset.show = "true";
  };
  const hide = () => {
    if (icon.current) icon.current.dataset.show = "false";
  };
  const swing = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !icon.current) return;
    const el = icon.current.firstElementChild as HTMLElement | null;
    if (!el) return;
    el.classList.remove(styles.swing);
    void el.offsetWidth; // restart the animation
    el.classList.add(styles.swing);
  };

  return (
    <div ref={wrap} className={styles.cursorArea} onPointerMove={move} onPointerLeave={hide} onPointerDown={swing}>
      {children}
      <div ref={icon} className={styles.cursor} data-show="false" aria-hidden>
        <div className={styles.cursorInner} style={{ transformOrigin: PIVOT[icon_] }}>
          <Icon size={ICON} />
        </div>
      </div>
    </div>
  );
}
