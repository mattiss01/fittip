import { MilestoneTick } from "./milestone-tick";
import { RoadmapDateRange } from "./roadmap-date-range";
import { formatRoadmapDate } from "./roadmap-dates";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

/**
 * The roadmap spine: this surface's visual signature (M3-02 decision 3),
 * restored unchanged in shape by M3-15E.
 *
 * It is a semantic ordered list, not a decorated stack, because the order is
 * real information — phase two follows phase one in time, and a review sits
 * between them. A review is the app's (ADR-027): one as each phase ends, the
 * last of them the end of the roadmap, dated the phase's last day. Nobody
 * writes them, so there is nothing to show but when, and whether it is due.
 *
 * What it deliberately is not: a progress meter. There is no percentage, no
 * star rating, no confidence score, and no red/amber/green badge anywhere in
 * this file. A roadmap contains no training volume, so anything that looked
 * measurable would be measuring nothing. A milestone the owner marked reached
 * says so, with its day (ADR-026); one not marked says nothing, whatever its
 * date, and nothing is counted.
 *
 * A Server Component. The mark is the one interaction, a client island per
 * milestone, and only where `marks` is given: the roadmap in force. The same
 * goes for `review`: a proposal's reviews are neither due nor done.
 */

/** For the roadmap in force: the phase whose review is due, and how far the
    owner has marked reviewed. Either may be none. */
export type SpineReview = {
  duePhaseIndex: number | null;
  reviewedThrough: number | null;
};

/** Which accepted version this is, and which of its milestones are marked. */
export type SpineMarks = {
  versionId: string;
  reached: { phaseIndex: number; milestoneIndex: number; reachedOn: string }[];
};

export type SpineGoalAttention = {
  goalId: string;
  level: "primary" | "secondary" | "maintenance" | "deferred";
};

/** A goal the phase works on: primary or secondary, not kept up or put off. */
function isWorkedOn(attention: SpineGoalAttention): boolean {
  return attention.level === "primary" || attention.level === "secondary";
}

export type SpineMilestone = {
  title: string;
  /** "Details", which may be left out (owner, 14 Oct 2026). */
  observableCriterion?: string;
  targetDate: string;
  goalIds: string[];
};

export type SpinePhase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  goalAttention: SpineGoalAttention[];
  milestones: SpineMilestone[];
};

export function RoadmapSpine({
  phases,
  goalTitles,
  marks,
  review,
}: {
  marks?: SpineMarks;
  review?: SpineReview;
  phases: SpinePhase[];
  /** Goal id to title, so the spine can name a goal without re-reading one. */
  goalTitles: Record<string, string>;
}) {
  return (
    <ol className={styles.spine}>
      {phases.map((phase, index) => (
        <PhaseAndItsReview
          key={`${phase.startDate}-${phase.title}`}
          phase={phase}
          index={index}
          total={phases.length}
          goalTitles={goalTitles}
          {...(marks === undefined ? {} : { marks })}
          {...(review === undefined ? {} : { review })}
        />
      ))}
    </ol>
  );
}

function PhaseAndItsReview({
  phase,
  index,
  total,
  goalTitles,
  marks,
  review,
}: {
  marks?: SpineMarks;
  review?: SpineReview;
  phase: SpinePhase;
  index: number;
  total: number;
  goalTitles: Record<string, string>;
}) {
  const state =
    review === undefined
      ? "ahead"
      : review.duePhaseIndex === index
        ? "due"
        : review.reviewedThrough !== null && index <= review.reviewedThrough
          ? "done"
          : "ahead";
  const lastDay = formatRoadmapDate(phase.endDate);

  return (
    <>
      <li className={styles.phase}>
        <div className={styles.phaseBand} tabIndex={-1}>
          <p className={styles.phaseIndex}>
            {ROADMAP_COPY.phaseIndex(index + 1, total)}
          </p>
          <h3 className={styles.phaseTitle}>{phase.title}</h3>
          {/* Drawn as the roadmap's own dates are (owner, 13 Oct 2026). */}
          <p className={styles.phaseDates}>
            <RoadmapDateRange
              startDate={phase.startDate}
              endDate={phase.endDate}
            />
          </p>
          <p className={styles.phaseFocus}>{phase.focus}</p>

          {/* The goal and no level (owner, 14 Oct 2026). The coach still
              writes and reads one; the roadmap shows only the goals a phase
              works on, not those it keeps up or puts off (owner, 21 Oct 2026:
              otherwise every goal is in every phase). */}
          {phase.goalAttention.some(isWorkedOn) ? (
            <ul className={styles.attentionList}>
              {phase.goalAttention.filter(isWorkedOn).map((attention) => (
                <li key={attention.goalId} className={styles.attention}>
                  {goalTitles[attention.goalId] ?? "Goal"}
                </li>
              ))}
            </ul>
          ) : null}

          {/* A phase may have no milestone since v3, and an empty list is
              not something to announce. */}
          {phase.milestones.length === 0 ? null : (
            <ul className={styles.milestoneList}>
              {phase.milestones.map((milestone, milestoneIndex) => (
                <li
                  // By position, as a mark is addressed: nothing makes two
                  // titles in one phase differ.
                  key={milestoneIndex}
                  className={styles.milestone}
                  // Where it can be ticked, the tick stands where the dot was.
                  data-markable={marks === undefined ? undefined : "true"}
                >
                  <p className={styles.milestoneTitle}>{milestone.title}</p>
                  {/* "Aim for by", never "Due". A milestone is something an
                      observer could verify, not something the owner owes. The
                      wording is a product decision, so it is imported rather
                      than written here. */}
                  <p className={styles.milestoneDate}>
                    {ROADMAP_COPY.milestonePrefix}{" "}
                    {formatRoadmapDate(milestone.targetDate)}
                  </p>
                  {milestone.observableCriterion === undefined ? null : (
                    <p className={styles.milestoneCriterion}>
                      {milestone.observableCriterion}
                    </p>
                  )}
                  {marks === undefined ? null : (
                    <MilestoneTick
                      versionId={marks.versionId}
                      phaseIndex={index}
                      milestoneIndex={milestoneIndex}
                      title={milestone.title}
                      reachedOn={
                        marks.reached.find(
                          (mark) =>
                            mark.phaseIndex === index &&
                            mark.milestoneIndex === milestoneIndex,
                        )?.reachedOn ?? null
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </li>
      <li className={styles.checkpoint} data-roadmap-review={state}>
        <div className={styles.checkpointBody}>
          <p className={styles.checkpointKind}>
            {state === "due"
              ? ROADMAP_COPY.reviewDueSince(lastDay)
              : state === "done"
                ? ROADMAP_COPY.reviewDone
                : ROADMAP_COPY.reviewOnDate(lastDay)}
          </p>
          <p className={styles.checkpointTitle}>
            {index + 1 === total
              ? ROADMAP_COPY.reviewAfterRoadmap
              : ROADMAP_COPY.reviewAfterPhase(index + 1)}
          </p>
        </div>
      </li>
    </>
  );
}
