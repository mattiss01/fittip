"use client";

import styles from "./log.module.css";

export default function QuickLogError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.shell}>
      <section className={styles.saved} role="alert">
        <p className={styles.kicker}>Actual unavailable</p>
        <h1>The log could not load.</h1>
        <p>
          Try again. FitTip cannot confirm any save outcome from this loading
          error alone.
        </p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
