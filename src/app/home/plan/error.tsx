"use client";

import homeStyles from "../home.module.css";

export default function PlanError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Plan</p>
        <h1>The plan is unavailable.</h1>
        <p>Nothing was changed. Retry the private read.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
