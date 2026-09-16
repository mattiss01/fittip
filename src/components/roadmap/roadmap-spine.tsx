import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

/**
 * The roadmap spine: this surface's visual signature (M3-02 decision 3),
 * restored unchanged in shape by M3-15E.
 *
 * It is a semantic ordered list, not a decorated stack, because the order is
 * real information — phase two follows phase one in time, and a review point
 * sits between them. That is also why review points are entries in the same
 * list rather than a separate section: they interleave with the phases, and
 * pulling them out would lose where they fall.
 *
 * What it deliberately is not: a progress meter. There is no percentage, no
 * star rating, no confidence score, and no red/amber/green badge anywhere in
 * this file. A roadmap contains no training volume, so anything that looked
 * measurable would be measuring nothing.
 *
 * A Server Component. It holds no state and takes no interaction, so shipping
 * it to the browser would be paying for JavaScript that renders the same bytes.
 */

export type SpineGoalAttention = {
  goalId: string;
  level: "primary" | "secondary" | "maintenance" | "deferred";
  reason: string;
};

export type SpineMilestone = {
  title: string;
  observableCriterion: string;
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

export type SpineReviewPoint = {
  title: string;
  triggerDate?: string;
  triggerCondition?: string;
  question: string;
};

export function RoadmapSpine({
  phases,
  reviewPoints,
  goalTitles,
}: {
  phases: SpinePhase[];
  reviewPoints: SpineReviewPoint[];
  /** Goal id to title, so the spine can name a goal without re-reading one. */
  goalTitles: Record<string, string>;
}) {
  // Dated review points fall between the phases they interrupt; conditional
  // ones have no place on the calendar and follow at the end.
  const dated = reviewPoints.filter((point) => Boolean(point.triggerDate));
  const conditional = reviewPoints.filter((point) => !point.triggerDate);

  return (
    <ol className={styles.spine}>
      {phases.map((phase, index) => (
        <PhaseAndFollowingCheckpoints
          key={`${phase.startDate}-${phase.title}`}
          phase={phase}
          index={index}
          total={phases.length}
          goalTitles={goalTitles}
          checkpoints={dated.filter(
            (point) =>
              (point.triggerDate as string) >= phase.startDate &&
              (point.triggerDate as string) <= phase.endDate,
          )}
        />
      ))}
      {conditional.map((point) => (
        <Checkpoint key={`condition-${point.title}`} point={point} />
      ))}
    </ol>
  );
}

function PhaseAndFollowingCheckpoints({
  phase,
  index,
  total,
  goalTitles,
  checkpoints,
}: {
  phase: SpinePhase;
  index: number;
  total: number;
  goalTitles: Record<string, string>;
  checkpoints: SpineReviewPoint[];
}) {
  return (
    <>
      <li className={styles.phase}>
        <div className={styles.phaseBand} tabIndex={-1}>
          <p className={styles.phaseIndex}>
            {ROADMAP_COPY.phaseIndex(index + 1, total)}
          </p>
          <h3 className={styles.phaseTitle}>{phase.title}</h3>
          <p className={styles.phaseDates}>
            {phase.startDate} → {phase.endDate}
          </p>
          <p className={styles.phaseFocus}>{phase.focus}</p>

          <ul className={styles.attentionList}>
            {phase.goalAttention.map((attention) => (
              <li
                key={attention.goalId}
                className={styles.attention}
                data-level={attention.level}
              >
                {/* The level is the whole claim: ordinal attention, never a
                    share of anything. */}
                {attention.level} · {goalTitles[attention.goalId] ?? "Goal"}
              </li>
            ))}
          </ul>
          {phase.goalAttention.map((attention) => (
            <p
              key={`${attention.goalId}-why`}
              className={styles.attentionReason}
            >
              {attention.reason}
            </p>
          ))}

          <ul className={styles.milestoneList}>
            {phase.milestones.map((milestone) => (
              <li key={milestone.title} className={styles.milestone}>
                <p className={styles.milestoneTitle}>{milestone.title}</p>
                {/* "Aim for by", never "Due". A milestone is something an
                    observer could verify, not something the owner owes. The
                    wording is a product decision, so it is imported rather
                    than written here. */}
                <p className={styles.milestoneDate}>
                  {ROADMAP_COPY.milestonePrefix} {milestone.targetDate}
                </p>
                <p className={styles.milestoneCriterion}>
                  {milestone.observableCriterion}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </li>
      {checkpoints.map((point) => (
        <Checkpoint key={`${point.triggerDate}-${point.title}`} point={point} />
      ))}
    </>
  );
}

function Checkpoint({ point }: { point: SpineReviewPoint }) {
  return (
    <li className={styles.checkpoint}>
      <div className={styles.checkpointBody}>
        <p className={styles.checkpointKind}>
          {point.triggerDate
            ? ROADMAP_COPY.reviewOnDate(point.triggerDate)
            : ROADMAP_COPY.reviewWhenCondition(point.triggerCondition ?? "")}
        </p>
        <h3 className={styles.checkpointTitle}>{point.title}</h3>
        <p className={styles.checkpointQuestion}>{point.question}</p>
      </div>
    </li>
  );
}
