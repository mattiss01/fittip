import styles from "../home.module.css";

export default function TodayLoading() {
  return (
    <main className={styles.shell} id="main-content" aria-busy="true">
      <section className={styles.stateCard} role="status">
        <p className={styles.kicker}>FitTip / today</p>
        <h1>Loading planned and actual records…</h1>
        <p>No completion is inferred while this page loads.</p>
      </section>
    </main>
  );
}
