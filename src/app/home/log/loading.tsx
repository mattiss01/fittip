import styles from "./log.module.css";

export default function LoadingQuickLog() {
  return (
    <main className={styles.shell} aria-busy="true">
      <section className={styles.saved}>
        <p className={styles.kicker}>Loading factual record</p>
        <h1>Keeping plan and actual separate…</h1>
      </section>
    </main>
  );
}
