/**
 * Why an accepted roadmap may not describe the week being planned.
 *
 * Here rather than in `@/server/ai/contracts` because both sides need it: the
 * context assembly that marks it for the coach, and the review surface that
 * shows it to the owner. That surface is a Client Component, and the client
 * import boundary in `src/architecture/server-boundary.test.ts` refuses
 * `@/server/**` even for a type.
 *
 * Two reasons rather than one flag, and they are kept apart because they mean
 * different things and are answered differently. A roadmap that has run out of
 * dates is still good direction for the training it described; a roadmap
 * pointed at a goal the owner has abandoned has a piece of its reasoning
 * missing. Collapsing them into "stale" would tell the owner something is
 * wrong without telling them what.
 */
export const ROADMAP_PLAN_STALE_REASONS = [
  /** The horizon falls outside the roadmap's own start and end dates. */
  "out_of_window",
  /**
   * A phase gives attention to a goal that is gone, archived, or no longer
   * active or achieved — the predicate `accept_roadmap_proposal` applies to a
   * goal source.
   */
  "goal_missing",
] as const;

export type RoadmapPlanStaleReason =
  (typeof ROADMAP_PLAN_STALE_REASONS)[number];
