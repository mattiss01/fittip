"use client";

import homeStyles from "../../home.module.css";

export default function RoadmapError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Plan / roadmap</p>
        <h1>Your roadmap is unavailable.</h1>
        <p>
          Nothing was changed and no proposal was generated. Retry the private
          read, or go back to Plan.
        </p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
