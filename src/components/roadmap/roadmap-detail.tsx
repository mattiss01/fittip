import { RoadmapSpine } from "./roadmap-spine";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  type RoadmapVersionView,
} from "@/server/roadmap/roadmap-records";

/**
 * One accepted roadmap, read end to end.
 *
 * The spine carries the phases and the review points; everything the coach
 * qualified its direction with follows underneath, because an assumption the
 * owner cannot see is an assumption they cannot correct. Every heading here is
 * an approved wording — three from `ROADMAP_COPY`, and "Held back for now"
 * from the accepted M3-02 surface — so none of them is written in this file.
 *
 * A Server Component with no interaction of its own. M3-15E restores reading
 * only: accepting, declining, editing and regenerating are M3-15F, and this
 * file contains no control that would suggest otherwise.
 */
export function RoadmapDetail({
  version,
  goalTitles,
}: {
  version: RoadmapVersionView;
  goalTitles: Record<string, string>;
}) {
  const roadmap = version.content;
  const assumptions = roadmap.assumptions ?? [];
  const uncertainties = roadmap.uncertainties ?? [];
  const held = roadmap.safetyConsiderations ?? [];

  return (
    <article data-roadmap-version={version.versionNumber}>
      <p className={styles.reviewHeader}>{ROADMAP_COPY.reviewHeader}</p>
      <h2 className={styles.proposalTitle}>{roadmap.title}</h2>
      <p className={styles.horizon}>
        Version {version.versionNumber} · {roadmap.startDate} →{" "}
        {roadmap.endDate}
      </p>
      <p className={styles.proposalSummary}>{roadmap.summary}</p>

      <RoadmapSpine
        phases={roadmap.phases}
        reviewPoints={roadmap.reviewPoints}
        goalTitles={goalTitles}
      />

      {assumptions.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>
            {ROADMAP_COPY.assumptionsHeading}
          </h3>
          <ul className={styles.plainList}>
            {assumptions.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {uncertainties.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>
            {ROADMAP_COPY.uncertaintiesHeading}
          </h3>
          {uncertainties.map((entry) => (
            <div className={styles.uncertainty} key={entry.statement}>
              <p>{entry.statement}</p>
              <p className={styles.uncertaintyMeta}>{entry.whyItMatters}</p>
              <p className={styles.uncertaintyMeta}>{entry.whatToWatch}</p>
            </div>
          ))}
        </section>
      ) : null}

      {held.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Held back for now</h3>
          <ul className={styles.plainList}>
            {held.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
