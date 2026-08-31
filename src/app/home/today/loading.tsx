import homeStyles from "../home.module.css";

export default function LoadingToday() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Today</p>
        <h1>Loading your day.</h1>
        <p>Nothing is planned, changed, or logged while this record loads.</p>
      </section>
    </main>
  );
}
