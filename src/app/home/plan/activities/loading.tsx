import homeStyles from "../../home.module.css";

export default function LoadingPersonalActivities() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>Your activities</p>
        <h1>Loading your activities.</h1>
        <p>Nothing is saved, changed or added while this private read runs.</p>
      </section>
    </main>
  );
}
