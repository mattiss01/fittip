"use client";

import homeStyles from "../../home.module.css";

/**
 * A read that failed is not a missing roadmap. This surface writes nothing, so
 * retrying is always safe, and the copy says so rather than leaving the owner
 * to wonder whether the roadmap they accepted is gone.
 */
export default function RoadmapError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Roadmap</p>
        <h1>Your roadmap could not be read.</h1>
        <p>
          Nothing was lost and nothing was changed. This surface only reads, so
          it is safe to try again.
        </p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
