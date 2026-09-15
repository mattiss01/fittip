import homeStyles from "../../home.module.css";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

export default function LoadingRoadmap() {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard} aria-live="polite">
        <p className={homeStyles.kicker}>{ROADMAP_COPY.stateKicker}</p>
        <h1>{ROADMAP_COPY.loadingTitle}</h1>
        <p>{ROADMAP_COPY.loadingBody}</p>
      </section>
    </main>
  );
}
