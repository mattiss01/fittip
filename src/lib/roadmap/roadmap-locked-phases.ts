/**
 * How many of a roadmap's phases have ended, and so are locked to an edit of
 * the roadmap in force (ADR-030; owner, 14 Oct 2026).
 *
 * A phase has ended when its last day is before the owner's today. Phases run
 * back to back and in order, so the ended ones are the first few. The form
 * draws them read-only, the action puts the stored ones back, and
 * `edit_roadmap` refuses any change to them on its own.
 */
export function lockedPhaseCount(
  phases: readonly { endDate: string }[],
  today: string,
): number {
  let count = 0;
  while (count < phases.length && phases[count]!.endDate < today) count += 1;
  return count;
}
