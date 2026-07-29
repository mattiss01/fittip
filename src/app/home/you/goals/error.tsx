"use client";

import homeStyles from "../../home.module.css";

export default function GoalsError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>You / goals</p>
        <h1>Goals are unavailable.</h1>
        <p>Nothing was changed. Retry the private read or return to You.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
