"use client";

import homeStyles from "../../home.module.css";

export default function MemoryError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>You / memory</p>
        <h1>Memory is unavailable.</h1>
        <p>Nothing was changed. Retry the private read or return to You.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
