"use client";

import homeStyles from "../home.module.css";

/**
 * A read that failed is not an empty month. Progress writes nothing, so
 * retrying is always safe, and the copy says so rather than leaving the owner
 * to wonder whether their record is gone.
 */
export default function ProgressError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Progress</p>
        <h1>Your record could not be read.</h1>
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
