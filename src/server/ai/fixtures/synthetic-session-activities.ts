import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIActivityReference,
  type CoachAIContext,
  type ProposedSessionActivity,
  type SessionActivitiesProposal,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";

/**
 * A deterministic activity list built from the request's own context.
 *
 * The same job the plan and roadmap synthesizers do: a corpus literal names
 * fixed library ids no real owner has, so a network-free run needs a body
 * derived from what it was given to be reviewable at all. It is the smallest
 * structurally valid answer, not a model, and says nothing about what a real
 * coach would propose.
 *
 * - A session that already has activities gets them back unchanged, in order,
 *   so the owner can exercise Save and Add back against their own list.
 * - An empty session gets up to four library entries in its sport, untargeted,
 *   so a library link reaches the editor.
 * - With neither, it gets one timed block the length of the session.
 *
 * It reaches no network and reads no clock: same context, same bytes.
 */

const MAX_FROM_LIBRARY = 4;

export function synthesizeSessionActivitiesBody(
  context: CoachAIContext,
): string {
  const detail = context.sessionDetail;
  if (detail === null) throw new CoachAIError("invalid_input");

  const session = detail.session;
  const sportKey = session.sport.trim().toLowerCase();

  let activities: ProposedSessionActivity[];
  if (session.activities.length > 0) {
    activities = session.activities
      .slice(0, 12)
      .map((activity) =>
        fromReference(activity, "Kept from your session unchanged."),
      );
  } else {
    const fromLibrary = detail.library
      .filter((entry) => entry.sport.trim().toLowerCase() === sportKey)
      .slice(0, MAX_FROM_LIBRARY);
    activities =
      fromLibrary.length > 0
        ? fromLibrary.map((entry) => ({
            personalActivityId: entry.id,
            name: entry.name,
            sport: entry.sport,
            instructions: null,
            measurementMode: entry.measurementMode,
            target: null,
            rationale: "From your library, in this session's sport.",
          }))
        : [
            {
              personalActivityId: null,
              name: `${session.title} main block`.slice(0, 120),
              sport: session.sport.slice(0, 80),
              instructions: null,
              measurementMode: "duration_intensity",
              target: {
                duration_minutes: session.durationMinutes ?? 30,
                intensity: "moderate",
              },
              rationale: "One timed block the length of the session.",
            },
          ];
  }

  const proposal: SessionActivitiesProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.fill_session_activities,
    summary:
      "An example list built from this session and your library by the built-in example coach. It is not real coaching.",
    activities,
    ...(context.hasSafetySignal
      ? {
          safetyConsiderations: [
            "Recent training recorded a signal, so nothing here raises load above what the session already held.",
          ],
        }
      : {}),
  };

  return JSON.stringify({
    ...proposal,
    safetyConsiderations: proposal.safetyConsiderations ?? null,
    activities: proposal.activities.map((activity) => ({
      ...activity,
      target: toGrammarTarget(activity.target),
    })),
  });
}

function fromReference(
  activity: CoachAIActivityReference,
  rationale: string,
): ProposedSessionActivity {
  return {
    personalActivityId: activity.personalActivityId,
    name: activity.name,
    sport: activity.sport,
    instructions: null,
    measurementMode: activity.measurementMode,
    target: toGroupedForm(activity.target),
    rationale,
  };
}

/**
 * The flat `sets_reps_load` form is still readable in stored rows but has no
 * place in the grammar, which offers only groups. It is the one-group case.
 */
function toGroupedForm(
  target: CoachAIActivityReference["target"],
): ProposedSessionActivity["target"] {
  if (target === null || !("sets" in target) || "groups" in target) {
    return target;
  }
  return {
    groups: [
      {
        sets: target.sets,
        reps: target.reps,
        ...(target.load === undefined ? {} : { load: target.load }),
      },
    ],
    ...(target.load_unit === undefined ? {} : { load_unit: target.load_unit }),
  };
}

const TARGET_FIELDS = [
  "groups",
  "load_unit",
  "duration_minutes",
  "intensity",
  "perceived_effort",
  "duration_seconds",
  "distance",
  "distance_unit",
  "pace_seconds_per_unit",
  "pace_unit",
  "repetitions",
  "unit",
  "label",
  "value",
] as const;

/**
 * The strict grammar's shape: every field present, the unused ones null. A
 * provider answers in this shape, so the example coach does too, and the
 * validator's null-stripping is exercised on every example run.
 */
function toGrammarTarget(
  target: ProposedSessionActivity["target"],
): Record<string, unknown> | null {
  if (target === null) return null;
  const source = target as Record<string, unknown>;
  const grammar: Record<string, unknown> = {};
  for (const field of TARGET_FIELDS) {
    const value = source[field];
    grammar[field] =
      field === "groups" && Array.isArray(value)
        ? value.map((group: Record<string, unknown>) => ({
            sets: group.sets ?? null,
            reps: group.reps ?? null,
            load: group.load ?? null,
          }))
        : (value ?? null);
  }
  return grammar;
}
