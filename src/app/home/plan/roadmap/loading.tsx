import homeStyles from "../../home.module.css";

export default function RoadmapLoading() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Plan / roadmap</p>
        <h1>Reading your roadmap.</h1>
        <p>Nothing is being changed.</p>
      </section>
    </main>
  );
}
