import styles from "./atoms.module.css";

interface Props {
  on: boolean;
  onLabel: string;
  offLabel: string;
  label: string;
  onChange: (next: boolean) => void;
}

/** A big two-state toggle; the label of the active side is lit. */
export function Switch({ on, onLabel, offLabel, label, onChange }: Props) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={styles.switch} data-on={on} onClick={() => onChange(!on)}>
      <span className={styles.switchTrack}>
        <i className={styles.switchKnob} />
      </span>
      <span className={styles.switchText}>{on ? onLabel : offLabel}</span>
    </button>
  );
}
