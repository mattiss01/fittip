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
        <p className={styles.kicker}>Actual not changed</p>
        <h1>The log could not load.</h1>
        <p>Try again. Your accepted plan and prior actuals remain unchanged.</p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
