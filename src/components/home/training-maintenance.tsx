import Link from "next/link";

import styles from "@/app/home/home.module.css";

/** One truthful surface for every training route during the F-005 reset. */
export function TrainingMaintenance() {
  return (
    <main className={styles.shell} id="main-content">
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>FitTip / training reset</p>
          <h1>One plan is taking shape.</h1>
          <p className={styles.intro}>
            Plan, Today, logging, Progress, and Coach planning are temporarily
            unavailable while FitTip moves to one continuous training plan.
          </p>
        </div>
        <p className={styles.stamp}>Reset in progress · no training records</p>
      </header>

      <section
        className={`${styles.stateCard} ${styles.maintenanceCard}`}
        aria-labelledby="training-maintenance-heading"
      >
        <p className={styles.sectionLabel}>What stays available</p>
        <h2 id="training-maintenance-heading">
          Your foundation is still here.
        </h2>
        <p className={styles.bodyCopy}>
          Your profile, goals, memory, onboarding, roadmap records, and personal
          activity definitions stay intact. Training will return here as the
          continuous Plan is built.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/home/you">
            Open You
          </Link>
          <Link className={styles.secondaryAction} href="/home/you/goals">
            Review goals
          </Link>
        </div>
      </section>
    </main>
  );
}
