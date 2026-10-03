import homeStyles from "../home.module.css";

export default function LoadingYou() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>You</p>
        <h1>Loading.</h1>
        <p>Nothing is changed while this private record loads.</p>
      </section>
    </main>
  );
}
