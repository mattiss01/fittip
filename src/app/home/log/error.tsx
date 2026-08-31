"use client";

import homeStyles from "../home.module.css";

export default function LogError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Log</p>
        <h1>The log form is unavailable.</h1>
        <p>
          The form could not be opened. If you had just saved a log, open the
          day and check before writing it a second time.
        </p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
