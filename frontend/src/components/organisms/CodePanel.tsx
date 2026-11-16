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
  const line = active === undefined ? undefined : code.anchors[active];
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
