import styles from "../home.module.css";

export default function ProgressLoading() {
  return (
    <main className={styles.shell} id="main-content" aria-busy="true">
      <section className={styles.stateCard} role="status">
        <p className={styles.kicker}>FitTip / progress</p>
        <h1>Loading the factual ledger…</h1>
        <p>No trend or outcome is inferred while records load.</p>
      </section>
    </main>
  );
}
