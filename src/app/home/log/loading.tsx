import homeStyles from "../home.module.css";

export default function LoadingLog() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Log</p>
        <h1>Opening the form.</h1>
        <p>Nothing is logged or changed while this record loads.</p>
      </section>
    </main>
  );
}
