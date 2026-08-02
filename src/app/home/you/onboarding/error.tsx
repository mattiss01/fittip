"use client";

import Link from "next/link";

import homeStyles from "../../home.module.css";
import styles from "./onboarding.module.css";

export default function OnboardingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <section className={styles.errorCard}>
        <p>Guided setup unavailable</p>
        <h1>Your draft could not be confirmed.</h1>
        <span>
          No answer has been shown or copied into this error. Try the
          owner-scoped read again.
        </span>
        <div>
          <button onClick={reset}>Try again</button>
          <Link href="/home/you">Back to You</Link>
        </div>
      </section>
    </main>
  );
}
