import { RoadmapSpine } from "./roadmap-spine";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import type { RoadmapProposal } from "@/server/ai/contracts";
import {
  isExampleAuthored,
  ROADMAP_COPY,
} from "@/server/roadmap/roadmap-records";

/**
 * One roadmap, read end to end — accepted or still proposed.
 *
 * The same body serves both because they are the same document at two moments,
 * and rendering a proposal more briefly than the version it would become would
 * mean deciding on less than the owner is agreeing to.
 *
 * The spine carries the phases and the review points; everything the coach
 * qualified its direction with follows underneath, because an assumption the
 * owner cannot see is an assumption they cannot correct. Every heading is an
 * approved wording from `ROADMAP_COPY`, so none of them is written here.
 *
 * A Server Component with no interaction of its own. The controls live beside
 * it, not in it.
 */
export function RoadmapBody({
  content,
  /** The line under the title: a version stamp, or a proposal's provenance. */
  meta,
  providerCode,
  goalTitles,
}: {
  content: RoadmapProposal;
  meta: string;
  /** `fixture` means the built-in example coach wrote this. */
  providerCode: string;
  goalTitles: Record<string, string>;
}) {
  const assumptions = content.assumptions ?? [];
  const uncertainties = content.uncertainties ?? [];
  const held = content.safetyConsiderations ?? [];

  return (
    <>
      <p className={styles.reviewHeader}>{ROADMAP_COPY.reviewHeader}</p>
      <ExampleTag providerCode={providerCode} />
      <h2 className={styles.proposalTitle}>{content.title}</h2>
      <p className={styles.horizon}>{meta}</p>
      <p className={styles.proposalSummary}>{content.summary}</p>

      <RoadmapSpine
        phases={content.phases}
        reviewPoints={content.reviewPoints}
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
              {/* The two labels are what make an uncertainty actionable: without
                  them these are two unattributed grey lines, and the owner
                  cannot tell why the direction depends on it from what to watch
                  for. M3-02's wording, restored here after M3-15E dropped it. */}
              <p className={styles.uncertaintyMeta}>
                <span className={styles.uncertaintyLabel}>
                  {ROADMAP_COPY.uncertaintyWhyItMatters}
                </span>{" "}
                {entry.whyItMatters}
              </p>
              <p className={styles.uncertaintyMeta}>
                <span className={styles.uncertaintyLabel}>
                  {ROADMAP_COPY.uncertaintyWhatToWatch}
                </span>{" "}
                {entry.whatToWatch}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {held.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>
            {ROADMAP_COPY.heldBackHeading}
          </h3>
          <ul className={styles.plainList}>
            {held.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * Who wrote this, when the answer is "nobody with a coaching model".
 *
 * The test is the stored `provider_code` and nothing else. With no provider
 * credential configured, the built-in example coach answers every generation,
 * and what it writes becomes permanent history the moment it is accepted — a
 * real roadmap with example wording. An owner who could not tell the two apart
 * would be reading an example as advice, which is the one way this surface
 * could mislead somebody about their own training.
 *
 * `origin` is deliberately not consulted. It says how a proposal came about, not
 * who wrote it, and an owner edit of an example is still an example.
 */
export function ExampleTag({ providerCode }: { providerCode: string }) {
  if (!isExampleAuthored(providerCode)) return null;
  return (
    <p className={styles.exampleTag} data-roadmap-example>
      {ROADMAP_COPY.exampleLabel}
    </p>
  );
}
