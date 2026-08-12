import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIContext,
  type CoachAIGoalReference,
} from "@/server/ai/contracts";
import { normalizeOwnerText } from "@/server/ai/owner-text";

/**
 * A deterministic plan built from the request's own context.
 *
 * The same job `synthesizeRoadmapBody` does, for the same reason: every body in
 * the authored corpus is a literal with fixed dates and fixed goal ids, so a
 * real owner rejects all of them. A network-free run that has to produce
 * something *reviewable* — the founder exercising compose, review and reject on
 * a Preview without spending anything — needs a body derived from the context
 * it was given.
 *
 * This is not a model and does not pretend to be one. It is the smallest
 * structurally valid plan for a given horizon and goal set. It says nothing
 * about whether a real coach would propose anything like it.
 *
 * It reaches no network and reads no clock: same context, same bytes.
 */

const DAY_MS = 86_400_000;
const MAX_SECONDARY_GOALS = 3;

export function synthesizePlanBody(context: CoachAIContext): string {
  const dates = horizonDates(context);
  const goals = context.targetableGoals;
  const primary = goals[0];
  const hasAcceptedLimitation = context.memory.some(
    (item) => item.memoryType === "constraint",
  );

  // Every second day carries a session, so a horizon of two days or more shows
  // both a training day and an explicit rest day — which is the thing the
  // surface most needs to be reviewable.
  const sessionDates = dates.filter((_date, index) => index % 2 === 0);

  const sessions = sessionDates.map((date, index) => ({
    date,
    title: hasAcceptedLimitation
      ? index === 0
        ? "Non-conflicting recovery session"
        : "Gentle supporting session"
      : index === 0
        ? "Easy aerobic session"
        : "Steadier session",
    sport: hasAcceptedLimitation ? "General recovery" : sportFor(primary),
    focus: bound(
      hasAcceptedLimitation
        ? "Gentle work outside the accepted limitation."
        : index === 0
          ? "Repeatable easy work you could do again tomorrow."
          : "A little more effort, still well short of a hard day.",
      300,
    ),
    intent: bound(
      hasAcceptedLimitation
        ? "Stop if this conflicts with the accepted limitation; otherwise keep it comfortable."
        : index === 0
          ? "Conversational the whole way. Finish feeling you could go again."
          : "Comfortably hard in the middle, easy either side of it.",
      300,
    ),
    durationMinutes: index === 0 ? 45 : 50,
    primaryGoalId: primary?.id ?? "",
    secondaryGoalIds: goals.slice(1, 1 + MAX_SECONDARY_GOALS).map((g) => g.id),
    alternatives:
      index === 0
        ? [
            {
              title: bound("A shorter version of the same session", 120),
              whenToChoose: bound(
                "If the time you have on the day turns out to be shorter.",
                200,
              ),
            },
          ]
        : null,
    rationale: bound(rationaleFor(primary, context), 300),
  }));

  const plan = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    weekDescription: bound(weekDescription(context, sessions.length), 600),
    startDate: context.horizonStartDate,
    endDate: context.horizonEndDate,
    sessions,
    assumptions: [
      bound(
        "Your recent training is representative of what you can sustain.",
        200,
      ),
    ],
    uncertainties: null,
    // An eligible reported signal is resolved by the surface before this
    // fixture is invoked: without accepted severity its tier is uncertain and
    // generation pauses. An accepted ordinary limitation instead leaves out
    // conflicting work while the rest of the horizon continues.
    safetyConsiderations: hasAcceptedLimitation
      ? [
          bound(
            "An accepted limitation is active. This leaves out work that conflicts with it and continues only with non-conflicting sessions.",
            240,
          ),
        ]
      : null,
  };

  return JSON.stringify({ plan, memoryCandidates: memoryCandidates(context) });
}

/**
 * At most one candidate, quoting the note's first sentence exactly. Quoting
 * rather than summarizing is the point: the excerpt must survive the substring
 * check in both the validator and `record_plan_memory_candidates`.
 */
function memoryCandidates(
  context: CoachAIContext,
): { memoryType: string; sourceExcerpt: string; confidence: number | null }[] {
  if (context.planningNote === null) return [];
  const note = normalizeOwnerText(context.planningNote);
  const firstSentence = note.split(/(?<=\.)\s+/)[0] ?? note;
  const excerpt = firstSentence.slice(0, 200).trim();
  if (excerpt.length === 0 || !note.includes(excerpt)) return [];

  return [{ memoryType: "constraint", sourceExcerpt: excerpt, confidence: 50 }];
}

function horizonDates(context: CoachAIContext): string[] {
  const startMs = Date.parse(`${context.horizonStartDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${context.horizonEndDate}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

function sportFor(goal: CoachAIGoalReference | undefined): string {
  return bound(
    goal ? goal.category.replace(/_/g, " ") : "General training",
    60,
  );
}

function rationaleFor(
  goal: CoachAIGoalReference | undefined,
  context: CoachAIContext,
): string {
  const base = goal
    ? `Most of this horizon stays easy so the work toward ${goal.title} is repeatable.`
    : "Without a dated objective this stays deliberately general.";
  return context.trainingHistory.sessionsIncluded === 0
    ? `${base} There is no recent training on record, so it starts conservatively.`
    : base;
}

function weekDescription(
  context: CoachAIContext,
  sessionCount: number,
): string {
  const dayCount =
    Math.round(
      (Date.parse(`${context.horizonEndDate}T00:00:00.000Z`) -
        Date.parse(`${context.horizonStartDate}T00:00:00.000Z`)) /
        DAY_MS,
    ) + 1;
  const goalCount = context.targetableGoals.length;
  const parts = [
    `This covers ${context.horizonStartDate} to ${context.horizonEndDate}: ${dayCount} day${dayCount === 1 ? "" : "s"} with ${sessionCount} session${sessionCount === 1 ? "" : "s"} in it.`,
    goalCount === 0
      ? "You have no active goals yet, so it holds a general base."
      : `It works across your ${goalCount} active goal${goalCount === 1 ? "" : "s"}, keeping most of the load easy.`,
    "The days without a session are rest, and they are planned rather than left over.",
  ];
  return parts.join(" ");
}

function bound(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}.`;
}
