"use client";

import Link from "next/link";

import homeStyles from "../../../home.module.css";

export default function SessionError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Plan</p>
        <h1>This session is unavailable</h1>
        <p>Nothing was changed. Retry the private read.</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          Retry
        </button>
        <Link href="/home/plan">Open Plan</Link>
      </section>
    </main>
  );
}
