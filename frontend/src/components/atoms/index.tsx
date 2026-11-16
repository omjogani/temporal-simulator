import type { ReactNode } from "react";
import type { Tone } from "@/lib/types";
import styles from "./atoms.module.css";

export { Button } from "./Button";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

export function StatusDot({ up }: { up: boolean }) {
  return <i className={styles.dot} data-up={up} aria-label={up ? "up" : "down"} />;
}

/** Large tabular number that briefly pulses when its value changes
 *  (keyed by value, so each change remounts and replays the animation). */
export function BigNumber({ value, tone = "neutral", size = "lg" }: { value: number; tone?: Tone; size?: "lg" | "sm" }) {
  return (
    <b key={value} className={`${styles.big} ${styles.bump}`} data-tone={tone} data-size={size}>
      {value}
    </b>
  );
}

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={styles.tag} data-tone={tone}>
      {children}
    </span>
  );
}

export function UrlPill({ host, path }: { host: string; path: string }) {
  return (
    <span className={styles.pill}>
      {host}/<b>{path}</b>
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className={styles.label}>{children}</span>;
}

export { Switch } from "./Switch";
