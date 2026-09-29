import homeStyles from "../../../home.module.css";

export default function LoadingSession() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Plan</p>
        <h1>Loading this session.</h1>
        <p>Nothing is planned or changed while this private record loads.</p>
      </section>
    </main>
  );
}
