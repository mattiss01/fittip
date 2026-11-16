import { Logo } from "./logo";
import styles from "./page-loading.module.css";

/**
 * Every page's loading screen (owner, 15 Nov 2026): the wordmark alone in the
 * middle, breathing slowly, and one quiet line saying what is on its way.
 * Nothing else is drawn, so nothing can be read as a fact before it loads.
 */
export function PageLoading({ label }: { label: string }) {
  return (
    <main className={styles.screen} id="main-content">
      <div className={styles.center} role="status" aria-live="polite">
        <div className={styles.pulse}>
          <Logo />
        </div>
        <p className={styles.label}>{label}</p>
      </div>
    </main>
  );
}
