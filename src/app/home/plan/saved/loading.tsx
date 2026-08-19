import homeStyles from "../../home.module.css";

export default function LoadingSavedSessions() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Saved sessions</p>
        <h1>Loading your library.</h1>
        <p>Nothing is saved, changed or added while this private read runs.</p>
      </section>
    </main>
  );
}
