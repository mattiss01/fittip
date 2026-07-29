"use client";

import styles from "../home.module.css";

export default function ProgressError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.shell} id="main-content">
      <section className={styles.stateCard} role="alert">
        <p className={styles.kicker}>Progress unavailable</p>
        <h1>The ledger could not load.</h1>
        <p>
          Check your connection and try again. No missing record is being
          interpreted as progress or failure.
        </p>
        <button className={styles.primaryAction} onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
