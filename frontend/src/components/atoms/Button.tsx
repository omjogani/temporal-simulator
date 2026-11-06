import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./atoms.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  children: ReactNode;
}

/** Base toolbar button. `pressed` marks the active tool. */
export function Button({ pressed, children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={[styles.button, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
