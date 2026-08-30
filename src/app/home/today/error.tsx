"use client";

import homeStyles from "../home.module.css";

export default function TodayError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Today</p>
        <h1>This day is unavailable.</h1>
        <p>Nothing was logged or changed. Retry the private read.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
