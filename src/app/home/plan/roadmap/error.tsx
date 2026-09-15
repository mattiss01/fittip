"use client";

import homeStyles from "../../home.module.css";
import { ROADMAP_ROUTE_STATE_COPY as COPY } from "@/lib/roadmap/roadmap-route-state-copy";

/**
 * A read that failed is not a missing roadmap. This surface writes nothing, so
 * retrying is always safe, and the copy says so rather than leaving the owner
 * to wonder whether the roadmap they accepted is gone.
 */
export default function RoadmapError({ reset }: { reset: () => void }) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>{COPY.stateKicker}</p>
        <h1>{COPY.errorTitle}</h1>
        <p>{COPY.errorBody}</p>
        <button className={homeStyles.primaryAction} onClick={reset}>
          {COPY.errorRetry}
        </button>
      </section>
    </main>
  );
}
