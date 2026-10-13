/**
 * A roadmap's reviews (ADR-027; owner, 13 October 2026).
 *
 * Nobody writes them. There is one as each phase ends, the last of them the
 * end of the roadmap, and it is due from the phase's last day. If more than
 * one phase has ended, only the latest asks: a review is of the roadmap as it
 * stands, so there is never a backlog of them to work through.
 *
 * What is stored is only how far the owner has marked reviewed
 * (`roadmap_review_marks`). Everything else here is arithmetic on the
 * accepted version and the owner's own today, which is why it is a pure
 * function: the page, the Plan's dot and the tests all ask it the same way.
 */

/** The review that is asking to be done. */
export type RoadmapReviewDue = {
  /** The phase that ended, from zero. */
  phaseIndex: number;
  /** Its last day, which is the day the review became due. */
  endedOn: string;
  /** The last phase: the roadmap itself has ended. */
  roadmapEnded: boolean;
};

export function roadmapReviewDue(
  phases: readonly { endDate: string }[],
  /** The owner's local day, `YYYY-MM-DD`. */
  today: string,
  /** The latest phase marked reviewed, or null when none has been. */
  reviewedThrough: number | null,
): RoadmapReviewDue | null {
  let ended = -1;
  phases.forEach((phase, index) => {
    // Calendar dates of one shape compare as text. Due from the last day
    // itself, not the day after.
    if (phase.endDate <= today) ended = index;
  });
  if (ended === -1) return null;
  if (reviewedThrough !== null && ended <= reviewedThrough) return null;
  return {
    phaseIndex: ended,
    endedOn: phases[ended].endDate,
    roadmapEnded: ended === phases.length - 1,
  };
}
