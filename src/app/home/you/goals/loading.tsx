import homeStyles from "../../home.module.css";

export default function LoadingGoals() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>You / goals</p>
        <h1>Loading your goal order.</h1>
        <p>No priorities are inferred while this private record loads.</p>
      </section>
    </main>
  );
}
