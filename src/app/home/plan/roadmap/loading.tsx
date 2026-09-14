import homeStyles from "../../home.module.css";

export default function LoadingRoadmap() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Roadmap</p>
        <h1>Loading your roadmap.</h1>
        <p>Nothing is proposed or changed while this loads.</p>
      </section>
    </main>
  );
}
