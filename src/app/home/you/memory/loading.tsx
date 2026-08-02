import homeStyles from "../../home.module.css";

export default function LoadingMemory() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>You / memory</p>
        <h1>Opening your memory file.</h1>
        <p>Nothing is inferred about you while this private record loads.</p>
      </section>
    </main>
  );
}
