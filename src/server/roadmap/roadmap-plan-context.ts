import "server-only";

import { CoachAIError } from "@/server/ai/errors";
import type {
  CoachAIRoadmapContext,
  CoachAIRoadmapPhase,
  CoachAIRoadmapPhaseSummary,
  CoachAIRoadmapStaleReason,
  RoadmapPhase,
  RoadmapProposal,
} from "@/server/ai/contracts";

/**
 * What an accepted roadmap may tell a coach that is planning one week.
 *
 * The rule, not the roadmap. The same fields leave on every call whatever the
 * stored roadmap's size, so the boundary is something the owner can read rather
 * than a function of how large their roadmap happened to grow. A roadmap that
 * would fit whole is still reduced.
 *
 * ## What leaves, field by field
 *
 * - The roadmap's own `title` and `summary`, and its start and end dates.
 * - The phase or phases the horizon falls in, **in full**: `focus`, the whole
 *   `goalAttention` including each `reason`, and every milestone.
 * - Every other phase as `title`, its dates, and `goalAttention` reduced to
 *   `goalId` and `level`.
 *
 * ## What never leaves
 *
 * `assumptions`, `uncertainties`, `reviewPoints` and `safetyConsiderations` —
 * they describe the whole horizon rather than this week. And for a phase the
 * week is not in: `focus`, every `goalAttention.reason`, and every milestone.
 * The product owner decided on 20 September 2026 that no model-authored prose
 * leaves for a phase the athlete is not training in; such a phase says what it
 * is for by naming the goals it attends to, which the coach already holds.
 *
 * There is no spread anywhere in this file, exactly as in
 * `training-history-context.ts`. A field added to `RoadmapPhase` or
 * `RoadmapProposal` later is invisible to a provider until this file changes
 * with it, where a spread would carry it while the allowlist still looked
 * correct.
 *
 * ## Staleness
 *
 * Marked, never blocking, and two separate facts rather than one flag, because
 * they mean different things and are fixed differently:
 *
 * - `out_of_window` — the week being planned is not inside the roadmap's own
 *   dates. The direction still informs the week; it just does not describe it.
 * - `goal_missing` — a goal one of the phases gives attention to is gone,
 *   archived, or no longer active or achieved. That is the predicate
 *   `accept_roadmap_proposal` already applies to a goal source
 *   (`20260916075522_m3_15f_roadmap_generation.sql:433`), rather than a second
 *   definition of what makes a goal reference stale. Goals carry a collection
 *   revision and not a per-goal one, so existence is the fact available here.
 */

/**
 * The share of the plan context this whole field may occupy.
 *
 * Derived, not chosen: `create_seven_day_plan` had 4,436 bytes of headroom
 * under its token ceiling before this ticket, and 4,000 leaves margin for the
 * prompt paragraph that describes the field. `context.ts` holds the arithmetic.
 */
export const ROADMAP_PLAN_CONTEXT_MAX_BYTES = 4_000;

export type RoadmapPlanContextInput = {
  /** The accepted version's content. */
  roadmap: RoadmapProposal;
  horizonStartDate: string;
  horizonEndDate: string;
  /**
   * Ids of goals the owner may currently be coached toward — active or
   * achieved and not archived. A phase attending to anything else is the
   * `goal_missing` stale reason.
   */
  targetableGoalIds: ReadonlySet<string>;
};

/**
 * Reduces an accepted roadmap to what the coach may read, then trims it to
 * `ROADMAP_PLAN_CONTEXT_MAX_BYTES` if it still does not fit.
 *
 * The trim is a bounded, disclosed reduction rather than a denial, which is the
 * choice ADR-013 decision 7 already made for training history. Goals, memory
 * and the planning note deny when they overflow because the owner can curate
 * them and so can act on the refusal; nobody shortens a phase description in
 * order to get a week planned. Every step is counted in the returned envelope,
 * because a coach that silently receives a subset reasons as though it saw
 * everything.
 *
 * The covering phase is never reduced. The ladder is ordered so that it never
 * has to be: with the other phases gone entirely, a single maximal covering
 * phase and the envelope come to roughly 3,750 bytes.
 */
export function buildRoadmapPlanContext(
  input: RoadmapPlanContextInput,
): CoachAIRoadmapContext {
  const isCovering = (phase: RoadmapPhase) =>
    overlaps(phase, input.horizonStartDate, input.horizonEndDate);

  // Ordered by how much of the week each holds, descending, so step 2 of the
  // ladder demotes the phase the athlete spends least of the week in.
  const covering = input.roadmap.phases
    .filter(isCovering)
    .sort(
      (left, right) =>
        coveredDays(right, input.horizonStartDate, input.horizonEndDate) -
        coveredDays(left, input.horizonStartDate, input.horizonEndDate),
    );
  const others = input.roadmap.phases.filter((phase) => !isCovering(phase));

  let context: CoachAIRoadmapContext = {
    title: input.roadmap.title,
    summary: input.roadmap.summary,
    // Structural, and already derivable from the phases: they are contiguous
    // and the last one ends on the roadmap's end date. Stated plainly so the
    // coach can see for itself whether the week sits inside the roadmap.
    startDate: input.roadmap.startDate,
    endDate: input.roadmap.endDate,
    ...staleness(input),
    coveringPhases: covering.map(toFullPhase),
    otherPhases: others.map(toPhaseSummary),
    phaseGoalAttentionWithheld: 0,
    phaseDetailWithheld: 0,
    otherPhasesWithheld: 0,
    milestonesWithheld: 0,
    goalAttentionReasonsWithheld: 0,
    focusTruncated: false,
  };
  if (fits(context)) return context;

  // 1. The non-covering phases lose their goal attention: it is the largest
  //    part of a summary and the least specific to the week.
  context = {
    ...context,
    otherPhases: context.otherPhases.map(withoutGoalAttention),
    phaseGoalAttentionWithheld: context.otherPhases.filter(
      (phase) => phase.goalAttention.length > 0,
    ).length,
  };
  if (fits(context)) return context;

  // 2. A week that straddles a phase boundary carries two phases in full. The
  //    one holding fewer of its days drops to the summary form.
  if (context.coveringPhases.length > 1) {
    const [kept, ...demoted] = context.coveringPhases;
    context = {
      ...context,
      coveringPhases: [kept],
      otherPhases: [
        ...demoted.map(withoutGoalAttention),
        ...context.otherPhases,
      ],
      phaseDetailWithheld: demoted.length,
      // The demoted phase loses its goal attention too, so it belongs in that
      // count. Without this the coach reads a phase with an empty
      // `goalAttention` and a withheld total that does not explain it.
      phaseGoalAttentionWithheld:
        context.phaseGoalAttentionWithheld +
        demoted.filter((phase) => phase.goalAttention.length > 0).length,
    };
    if (fits(context)) return context;
  }

  // 3. The other phases go entirely, counted.
  context = {
    ...context,
    otherPhases: [],
    otherPhasesWithheld: context.otherPhases.length,
  };
  if (fits(context)) return context;

  // 4. The covering phase itself, as a last resort and in the order that costs
  //    the coach least: what the phase is measured by, then why each goal gets
  //    its attention, then the phase description itself, truncated.
  //
  //    This ticket first claimed the covering phase was never reduced, on the
  //    arithmetic that a maximal phase plus the envelope came to roughly 3,750
  //    bytes. That was wrong twice over. The budget counts UTF-8 bytes while
  //    the validator bounds characters (`isBounded` uses `.length`), so a
  //    roadmap written with em dashes or in a non-Latin script is three times
  //    the size the character limits suggest — measured, a maximal phase of
  //    three-byte characters is 8,992 bytes. And the first measurement used a
  //    fixture below several of the real limits.
  //
  //    Without these steps the function returns over budget, `context.ts`
  //    raises `CoachAIContextTooLargeError("roadmap")`, and the owner cannot
  //    generate any plan at all — not even the goals-only one they could have
  //    had before they ever accepted a roadmap. Refusing was the one behaviour
  //    the product owner ruled out on 20 September 2026, and a refusal nobody
  //    can act on is the worst version of it.
  context = {
    ...context,
    coveringPhases: context.coveringPhases.map((phase) => ({
      ...phase,
      milestones: [],
    })),
    milestonesWithheld: context.coveringPhases.reduce(
      (total, phase) => total + phase.milestones.length,
      0,
    ),
  };
  if (fits(context)) return context;

  context = {
    ...context,
    coveringPhases: context.coveringPhases.map((phase) => ({
      ...phase,
      goalAttention: phase.goalAttention.map((attention) => ({
        goalId: attention.goalId,
        level: attention.level,
        reason: "",
      })),
    })),
    goalAttentionReasonsWithheld: context.coveringPhases.reduce(
      (total, phase) =>
        total + phase.goalAttention.filter((one) => one.reason !== "").length,
      0,
    ),
  };
  if (fits(context)) return context;

  //    The floor, and it is reachable only in theory. A UTF-16 code unit — the
  //    thing the validator counts — is at most three UTF-8 bytes, so with
  //    milestones and reasons gone the worst validator-legal roadmap serializes
  //    to roughly 3,200 bytes: title 80 units and summary 600 at 3 bytes each,
  //    four goal ids, the dates and the envelope. That already fits, which is
  //    why no test can make `focusTruncated` true through the public shape.
  //    The step stays because the bound is a property of today's validator
  //    limits rather than of this module, and it is exactly that kind of
  //    cross-file reasoning that was wrong the first time.
  const reduced = truncateFocusToFit(context);

  // The postcondition, asserted rather than assumed. Every earlier return is
  // guarded by `fits`; this is the one path that reasons its way to the answer
  // instead of checking it, and the reasoning is exactly what was wrong the
  // first time. `context.ts` raises `context_too_large` on what this returns,
  // so a silent overrun here becomes a refusal the owner cannot act on.
  //
  // It can only fire on content the roadmap validator would have rejected —
  // measured, a roadmap at twice the validator's summary and focus limits.
  // Such a roadmap cannot be accepted, so this is a guard against the limits
  // moving apart later, not a path an owner can reach today.
  if (!fits(reduced)) throw new CoachAIError("context_invalid");
  return reduced;
}

/**
 * Shortens the covering phase's `focus` until the whole field fits.
 *
 * By bytes and on a character boundary, because the budget is bytes and
 * slicing a string mid-character would produce a replacement character that is
 * itself three bytes — spending budget to say nothing.
 */
function truncateFocusToFit(
  context: CoachAIRoadmapContext,
): CoachAIRoadmapContext {
  const original = context.coveringPhases.map((phase) => phase.focus);

  let limit = Math.max(
    ...context.coveringPhases.map((phase) => [...phase.focus].length),
  );
  let candidate = context;
  while (limit > 0) {
    limit = Math.floor(limit / 2);
    candidate = {
      ...context,
      coveringPhases: context.coveringPhases.map((phase) => ({
        ...phase,
        focus: [...phase.focus].slice(0, limit).join(""),
      })),
    };
    if (fits(candidate)) break;
  }

  return {
    ...candidate,
    focusTruncated: candidate.coveringPhases.some(
      (phase, index) => phase.focus !== original[index],
    ),
  };
}

/**
 * The two stale facts, exported because the review surface shows the owner the
 * same ones the coach was told. One predicate, read twice — a second copy on
 * the surface would be free to drift from what was actually sent.
 */
export function roadmapPlanStaleReasons(
  input: RoadmapPlanContextInput,
): CoachAIRoadmapStaleReason[] {
  return staleness(input).staleReasons;
}

function staleness(input: RoadmapPlanContextInput): {
  isStale: boolean;
  staleReasons: CoachAIRoadmapStaleReason[];
} {
  const reasons: CoachAIRoadmapStaleReason[] = [];
  if (
    input.horizonEndDate > input.roadmap.endDate ||
    input.horizonStartDate < input.roadmap.startDate
  ) {
    reasons.push("out_of_window");
  }
  const attendsMissingGoal = input.roadmap.phases.some((phase) =>
    phase.goalAttention.some(
      (attention) => !input.targetableGoalIds.has(attention.goalId),
    ),
  );
  if (attendsMissingGoal) reasons.push("goal_missing");
  return { isStale: reasons.length > 0, staleReasons: reasons };
}

/** Every field of a phase the week falls in, copied one at a time. */
function toFullPhase(phase: RoadmapPhase): CoachAIRoadmapPhase {
  return {
    title: phase.title,
    focus: phase.focus,
    startDate: phase.startDate,
    endDate: phase.endDate,
    goalAttention: phase.goalAttention.map((attention) => ({
      goalId: attention.goalId,
      level: attention.level,
      reason: attention.reason,
    })),
    milestones: phase.milestones.map((milestone) => ({
      title: milestone.title,
      observableCriterion: milestone.observableCriterion,
      targetDate: milestone.targetDate,
      goalIds: milestone.goalIds.map((goalId) => goalId),
    })),
  };
}

/**
 * A phase the week is not in: what it is called, when it runs, and which goals
 * it attends to. `reason` is dropped with the rest of the prose.
 */
function toPhaseSummary(phase: RoadmapPhase): CoachAIRoadmapPhaseSummary {
  return {
    title: phase.title,
    startDate: phase.startDate,
    endDate: phase.endDate,
    goalAttention: phase.goalAttention.map((attention) => ({
      goalId: attention.goalId,
      level: attention.level,
    })),
  };
}

function withoutGoalAttention(
  phase: CoachAIRoadmapPhaseSummary | CoachAIRoadmapPhase,
): CoachAIRoadmapPhaseSummary {
  return {
    title: phase.title,
    startDate: phase.startDate,
    endDate: phase.endDate,
    goalAttention: [],
  };
}

function overlaps(
  phase: RoadmapPhase,
  horizonStartDate: string,
  horizonEndDate: string,
): boolean {
  return phase.startDate <= horizonEndDate && phase.endDate >= horizonStartDate;
}

/** How many of the horizon's days fall inside this phase. */
function coveredDays(
  phase: RoadmapPhase,
  horizonStartDate: string,
  horizonEndDate: string,
): number {
  const start =
    phase.startDate > horizonStartDate ? phase.startDate : horizonStartDate;
  const end = phase.endDate < horizonEndDate ? phase.endDate : horizonEndDate;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function fits(context: CoachAIRoadmapContext): boolean {
  return roadmapPlanContextBytes(context) <= ROADMAP_PLAN_CONTEXT_MAX_BYTES;
}

export function roadmapPlanContextBytes(
  context: CoachAIRoadmapContext,
): number {
  return byteLength(JSON.stringify(context));
}

/**
 * Local rather than imported from `context.ts`, for the same reason
 * `training-history-context.ts` keeps its own: that module imports this one,
 * and a cycle between the context assembly and the sources it assembles is not
 * worth saving four lines.
 */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
