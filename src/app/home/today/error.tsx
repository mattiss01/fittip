"use client";

import styles from "../home.module.css";

export default function TodayError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.shell} id="main-content">
      <section className={styles.stateCard} role="alert">
        <p className={styles.kicker}>Today unavailable</p>
        <h1>The records could not load.</h1>
        <p>
          Check your connection and try again. FitTip has not changed your plan
          or recorded an actual.
        </p>
        <button className={styles.primaryAction} onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
