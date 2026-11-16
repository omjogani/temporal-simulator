import type { CSSProperties, ReactNode } from "react";
import styles from "./ArenaTemplate.module.css";

interface Props {
  /** Step accent colour (a CSS colour or var()). */
  accent: string;
  /** Illustrated stage drawn behind the panels and the board. */
  backdrop: ReactNode;
  url: ReactNode;
  title: string;
  tag: ReactNode;
  extra?: ReactNode;
  speed?: ReactNode;
  toolbox: ReactNode;
  left: ReactNode;
  board: ReactNode;
  overlay?: ReactNode;
  right: ReactNode;
  /** Optional strip under the board (idiom scenes: workflow history). */
  strip?: ReactNode;
  caption: ReactNode;
  banner: ReactNode;
}

/** Page layout of the simulator: top bar, panel | board | panel, caption, step rail. */
export function ArenaTemplate({ accent, backdrop, url, title, tag, extra, speed, toolbox, left, board, overlay, right, strip, caption, banner }: Props) {
  return (
    <main className={styles.arena} style={{ "--c-accent": accent } as CSSProperties}>
      <header className={styles.top}>
        {url}
        <h1 className={styles.title}>{title}</h1>
        {tag}
        {extra}
        <div className={styles.tools}>
          {speed}
          {toolbox}
        </div>
      </header>
      <div className={styles.grid}>
        <div className={styles.backdrop} aria-hidden>
          {backdrop}
        </div>
        <div className={styles.left}>{left}</div>
        <div className={styles.board}>
          {board}
          {overlay}
        </div>
        {strip && <div className={styles.strip}>{strip}</div>}
        <div className={styles.right}>{right}</div>
      </div>
      <div className={styles.foot}>
        {caption}
        {banner}
      </div>
    </main>
  );
}
