"use client";

import homeStyles from "../home.module.css";

export default function TodayError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Today</p>
        <h1>This day is unavailable.</h1>
        <p>
          This day could not be read. If you had just saved a log, open the day
          again and check before writing it a second time.
        </p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
