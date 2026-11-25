"use client";

import { memo, useState } from "react";
import { Kbd } from "@/components/atoms";
import { ScoreStat } from "@/components/molecules";
import { toggleCodeOpen, useCodeOpen } from "@/lib/codeOpen";
import type { CodeAnchor, CodeSnippet } from "@/lib/steps";
import type { PanelsView } from "@/lib/types";
import styles from "./organisms.module.css";

interface Props {
  rule: string;
  panels: PanelsView;
}

/** The scene's rule in big type, the code toggle (K) and a compact score row. */
export function CodePanel({ rule, panels }: Props) {
  const open = useCodeOpen();
  return (
    <aside className={`${styles.panel} ${styles.codePanel}`} aria-label="Rule">
      <p className={styles.rule}>{rule}</p>
      <button type="button" className={styles.codeToggle} aria-pressed={open} aria-controls="code-drawer" onClick={toggleCodeOpen}>
        <span>‹/› {open ? "Hide code" : "Code"}</span>
        <Kbd>K</Kbd>
      </button>
      <div className={styles.scoreRow}>
        {panels.score.map((s) => (
          <ScoreStat key={s.key} item={s} />
        ))}
      </div>
    </aside>
  );
}

interface DrawerProps {
  code: CodeSnippet;
  /** Anchor of the line the selected order is on. */
  active?: CodeAnchor;
}

/**
 * The real code behind the scene, in a drawer over the right side of the board. It slides
 * in and out without reflowing the board, and only re-renders when the active line changes.
 */
export const CodeDrawer = memo(function CodeDrawer({ code, active }: DrawerProps) {
  const open = useCodeOpen();
  // The courier timer sits between two activities; when this snippet has no line for it,
  // keep the previous line lit instead of blinking the highlight off for the wait.
  const [held, setHeld] = useState<number>();
  const mapped = active === undefined ? undefined : code.anchors[active];
  const line = active === "courier" && mapped === undefined ? held : mapped;
  if (line !== held) setHeld(line);
  return (
    <div id="code-drawer" className={styles.codeDrawer} data-open={open} aria-hidden={!open} aria-label="Code">
      <pre className={styles.code}>
        {code.lines.map((l, i) => (
          <code key={i} data-active={i === line}>
            {l || " "}
          </code>
        ))}
      </pre>
    </div>
  );
});
