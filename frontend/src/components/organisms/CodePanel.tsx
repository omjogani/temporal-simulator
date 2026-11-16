"use client";

import { useState } from "react";
import { ScoreStat } from "@/components/molecules";
import type { CodeAnchor, CodeSnippet } from "@/lib/steps";
import type { PanelsView } from "@/lib/types";
import styles from "./organisms.module.css";

interface Props {
  rule: string;
  code: CodeSnippet;
  /** Anchor of the line the selected order is on. */
  active?: CodeAnchor;
  panels: PanelsView;
}

/** The scene's rule in big type, the real code behind it, and a compact score row. */
export function CodePanel({ rule, code, active, panels }: Props) {
  // The courier timer sits between two activities; when this snippet has no line for it,
  // keep the previous line lit instead of blinking the highlight off for the wait.
  const [held, setHeld] = useState<number>();
  const mapped = active === undefined ? undefined : code.anchors[active];
  const line = active === "courier" && mapped === undefined ? held : mapped;
  if (line !== held) setHeld(line);
  return (
    <aside className={`${styles.panel} ${styles.codePanel}`} aria-label="Code">
      <p className={styles.rule}>{rule}</p>
      <pre className={styles.code}>
        {code.lines.map((l, i) => (
          <code key={i} data-active={i === line}>
            {l || " "}
          </code>
        ))}
      </pre>
      <div className={styles.scoreRow}>
        {panels.score.map((s) => (
          <ScoreStat key={s.key} item={s} />
        ))}
      </div>
    </aside>
  );
}
