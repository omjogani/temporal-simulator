import type { ReactNode } from "react";
import styles from "./ArenaTemplate.module.css";

interface Props {
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
  caption: ReactNode;
  banner: ReactNode;
  rail: ReactNode;
}

/** Page layout of the simulator: top bar, panel | board | panel, caption, step rail. */
export function ArenaTemplate({ url, title, tag, extra, speed, toolbox, left, board, overlay, right, caption, banner, rail }: Props) {
  return (
    <main className={styles.arena}>
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
        <div className={styles.left}>{left}</div>
        <div className={styles.board}>
          {board}
          {overlay}
        </div>
        <div className={styles.right}>{right}</div>
      </div>
      <div className={styles.foot}>
        {caption}
        {banner}
        {rail}
      </div>
    </main>
  );
}
