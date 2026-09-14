import homeStyles from "../home.module.css";

export default function LoadingProgress() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Progress</p>
        <h1>Loading your record.</h1>
        <p>Nothing is logged or changed while this record loads.</p>
      </section>
    </main>
  );
}
