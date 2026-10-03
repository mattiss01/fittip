"use client";

import homeStyles from "../../home.module.css";

export default function SettingsError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Settings</p>
        <h1>Settings is unavailable.</h1>
        <p>Nothing was changed. Retry the private read.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
