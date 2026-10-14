import { RoadmapDateRange } from "./roadmap-date-range";
import {
  RoadmapSpine,
  type SpineMarks,
  type SpineReview,
} from "./roadmap-spine";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import type { StoredRoadmap } from "@/server/ai/contracts";
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
 * The spine is the whole of a roadmap: its phases, with a review as each one
 * ends (ADR-027). A row stored under an earlier version holds more, review
 * points the coach wrote and before that assumptions and uncertainties; none
 * of it is read or shown (owner, 13 October 2026).
 *
 * A Server Component with no interaction of its own. The controls live beside
 * it, not in it.
 */
export function RoadmapBody({
  content,
  startDate,
  endDate,
  note,
  providerCode,
  goalTitles,
  marks,
  review,
}: {
  /** Given for the roadmap in force only; a proposal's milestones take none. */
  marks?: SpineMarks;
  /** Likewise: a proposal's reviews are neither due nor done. */
  review?: SpineReview;
  content: StoredRoadmap;
  /** The roadmap's own first and last day, or the days a proposal was asked for. */
  startDate: string;
  endDate: string;
  /** A proposal's provenance, said before its dates. A roadmap has none. */
  note?: string;
  /** `fixture` means the built-in example coach wrote this. */
  providerCode: string;
  goalTitles: Record<string, string>;
}) {
  return (
    <>
      <ExampleTag providerCode={providerCode} />
      <h2 className={styles.proposalTitle}>{content.title}</h2>
      {/* From and to (owner, 13 and 14 Oct 2026). No version number: the
          page shows the roadmap in force and nothing to compare it with. */}
      <p className={styles.horizon}>
        {note === undefined ? null : (
          <span className={styles.horizonNote}>{note}</span>
        )}
        <RoadmapDateRange startDate={startDate} endDate={endDate} />
      </p>
      {/* A roadmap written by hand may have none (owner, 14 Oct 2026). */}
      {content.summary === undefined ? null : (
        <p className={styles.proposalSummary}>{content.summary}</p>
      )}

      <RoadmapSpine
        phases={content.phases}
        goalTitles={goalTitles}
        {...(marks === undefined ? {} : { marks })}
        {...(review === undefined ? {} : { review })}
      />
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
