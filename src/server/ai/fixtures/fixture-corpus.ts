import "server-only";

import type { CoachAIContext, CoachAIOperation } from "@/server/ai/contracts";
import type { CoachAIRejectionReason } from "@/server/ai/output-validation";

/**
 * The fixture corpus is an authored checklist, not sampled model output.
 *
 * Every entry exists because someone named a way structured output goes wrong
 * and wrote the smallest body that goes wrong that way. Sampling a real
 * provider would produce whatever that provider happened to do that afternoon,
 * which proves the validator handles that afternoon. Enumerating the failure
 * modes proves it handles the ones we decided matter, and makes a gap in the
 * list visible as a missing entry rather than invisible as an unsampled case.
 *
 * Nothing here reaches a network. Every body is a literal in this file.
 */

export const COACH_AI_FIXTURE_TODAY = "2026-08-04";

/** An active, unarchived goal: the only kind a proposal may target. */
export const COACH_AI_FIXTURE_TARGETABLE_GOAL_ID =
  "a1000000-0000-4000-8000-000000000001";
/** An achieved goal: readable history under ADR-012, never a valid objective. */
export const COACH_AI_FIXTURE_HISTORICAL_GOAL_ID =
  "a1000000-0000-4000-8000-000000000002";
/** A goal this owner does not have. */
export const COACH_AI_FIXTURE_UNOWNED_GOAL_ID =
  "b2000000-0000-4000-8000-0000000000ff";

/**
 * The context the corpus is validated against. Its `today` is fixed so every
 * date assertion is deterministic whatever the wall clock says.
 */
export const COACH_AI_FIXTURE_CONTEXT: CoachAIContext = {
  today: COACH_AI_FIXTURE_TODAY,
  targetableGoals: [
    {
      id: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
      title: "Run a hilly half marathon",
      category: "performance_event",
      priorityTier: "core",
      targetDate: "2026-11-15",
    },
  ],
  historicalGoals: [
    {
      id: COACH_AI_FIXTURE_HISTORICAL_GOAL_ID,
      title: "Hold a 30 second front lever",
      category: "skill",
      priorityTier: "supporting",
      targetDate: null,
    },
  ],
  memory: [
    {
      id: "c3000000-0000-4000-8000-000000000001",
      memoryType: "constraint",
      content: "Trains before work on weekdays.",
    },
  ],
};

export type CoachAIFixtureExpectation =
  | { outcome: "accepted" }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

export type CoachAIFixtureCase = {
  /** Stable identifier. A script names a case by this. */
  readonly name: string;
  readonly operation: CoachAIOperation;
  /** The exact untrusted body an adapter would return. */
  readonly body: string;
  readonly expected: CoachAIFixtureExpectation;
  /** Why this failure mode is in the checklist. */
  readonly note: string;
};

const VALID_ROADMAP = {
  schemaVersion: "fittip.roadmap.v1",
  summary:
    "Twelve weeks of aerobic base and hill strength before a race-specific block.",
  phases: [
    {
      title: "Aerobic base",
      focus: "Easy volume with one weekly hill circuit.",
      startDate: "2026-08-04",
      endDate: "2026-09-14",
      goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    },
    {
      title: "Race specific",
      focus: "Sustained efforts on course-like terrain.",
      startDate: "2026-09-15",
      endDate: "2026-11-01",
      goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    },
  ],
};

const VALID_PLAN = {
  schemaVersion: "fittip.seven-day-plan.v1",
  startDate: "2026-08-04",
  sessions: [
    {
      date: "2026-08-04",
      title: "Easy aerobic run",
      intent: "Time on feet at a conversational effort.",
      durationMinutes: 45,
      goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    },
    {
      date: "2026-08-06",
      title: "Hill repeats",
      intent: "Six by two minutes uphill, walking recovery.",
      durationMinutes: 50,
      goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    },
    {
      date: "2026-08-09",
      title: "Long run",
      intent: "Steady effort with the last fifteen minutes stronger.",
      durationMinutes: 90,
      goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    },
  ],
};

export const COACH_AI_FIXTURE_CASES: readonly CoachAIFixtureCase[] = [
  {
    name: "valid_roadmap",
    operation: "create_roadmap",
    body: JSON.stringify(VALID_ROADMAP),
    expected: { outcome: "accepted" },
    note: "The shape the contract promises, so the validator is proven to accept something.",
  },
  {
    name: "valid_seven_day_plan",
    operation: "create_seven_day_plan",
    body: JSON.stringify(VALID_PLAN),
    expected: { outcome: "accepted" },
    note: "The second operation's happy path.",
  },
  {
    name: "truncated_json",
    operation: "create_roadmap",
    body: JSON.stringify(VALID_ROADMAP).slice(0, 180),
    expected: { outcome: "rejected", reason: "unparsable" },
    note: "A stream cut by a deadline, a token ceiling, or a dropped connection.",
  },
  {
    name: "prose_fallback",
    operation: "create_seven_day_plan",
    body: "Sure! Here is a seven day plan. Monday: an easy 45 minute run. Wednesday: hill repeats.",
    expected: { outcome: "rejected", reason: "unparsable" },
    note: "A model answering in sentences. Prose is never salvaged into a plan.",
  },
  {
    name: "json_array_body",
    operation: "create_roadmap",
    body: JSON.stringify([VALID_ROADMAP]),
    expected: { outcome: "rejected", reason: "schema" },
    note: "Valid JSON that is not an object at the top level.",
  },
  {
    name: "schema_violating_json",
    operation: "create_roadmap",
    body: JSON.stringify({
      schemaVersion: "fittip.roadmap.v1",
      summary: "Three phases through to the race.",
      phases: "aerobic base, race specific, taper",
    }),
    expected: { outcome: "rejected", reason: "schema" },
    note: "A field with the right name and the wrong type.",
  },
  {
    name: "wrong_schema_version",
    operation: "create_roadmap",
    body: JSON.stringify({ ...VALID_ROADMAP, schemaVersion: "roadmap.v0" }),
    expected: { outcome: "rejected", reason: "schema" },
    note: "Output built against a schema this server no longer speaks.",
  },
  {
    name: "extra_fields",
    operation: "create_roadmap",
    body: JSON.stringify({ ...VALID_ROADMAP, confidence: 0.82 }),
    expected: { outcome: "rejected", reason: "unknown_field" },
    note: "An unrequested field. Accepting it would let a provider widen the contract.",
  },
  {
    name: "extra_nested_field",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: VALID_PLAN.sessions.map((session, index) =>
        index === 0 ? { ...session, rpe: 4 } : session,
      ),
    }),
    expected: { outcome: "rejected", reason: "unknown_field" },
    note: "The same widening one level down, where a shallow check would miss it.",
  },
  {
    name: "impossible_date",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      phases: [{ ...VALID_ROADMAP.phases[0], startDate: "2026-02-30" }],
    }),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "A well-formed date string for a day that does not exist.",
  },
  {
    name: "reversed_phase_dates",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      phases: [
        {
          ...VALID_ROADMAP.phases[0],
          startDate: "2026-09-14",
          endDate: "2026-08-04",
        },
      ],
    }),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "A phase that ends before it starts.",
  },
  {
    name: "session_outside_plan_week",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [{ ...VALID_PLAN.sessions[0], date: "2026-09-01" }],
    }),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "A real date outside the seven days the operation covers.",
  },
  {
    name: "impossible_duration",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [{ ...VALID_PLAN.sessions[0], durationMinutes: 600 }],
    }),
    expected: { outcome: "rejected", reason: "invalid_duration" },
    note: "A ten hour session: parseable, plausible to a parser, wrong for a person.",
  },
  {
    name: "fractional_duration",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [{ ...VALID_PLAN.sessions[0], durationMinutes: 45.5 }],
    }),
    expected: { outcome: "rejected", reason: "invalid_duration" },
    note: "A non-integer where the schema promises whole minutes.",
  },
  {
    name: "unowned_goal_reference",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [
        { ...VALID_PLAN.sessions[0], goalId: COACH_AI_FIXTURE_UNOWNED_GOAL_ID },
      ],
    }),
    expected: { outcome: "rejected", reason: "unowned_goal_reference" },
    note: "A goal id this owner does not have. A proposal must never reach across owners.",
  },
  {
    name: "historical_goal_reference",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      phases: [
        {
          ...VALID_ROADMAP.phases[0],
          goalId: COACH_AI_FIXTURE_HISTORICAL_GOAL_ID,
        },
      ],
    }),
    expected: { outcome: "rejected", reason: "unowned_goal_reference" },
    note: "ADR-012: an achieved goal is readable history and never an objective.",
  },
  {
    name: "oversized_payload",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      summary: `Twelve weeks of aerobic base. ${"Repeat the plan. ".repeat(1200)}`,
    }),
    expected: { outcome: "rejected", reason: "too_large" },
    note: "Rejected on size before anything parses it.",
  },
  {
    name: "unsafe_medical_phrasing",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [
        {
          ...VALID_PLAN.sessions[0],
          intent:
            "Ignore the pain in your knee and push through the pain for the full hour.",
        },
      ],
    }),
    expected: { outcome: "rejected", reason: "unsafe_content" },
    note: "Structurally perfect and conservatively unacceptable. Safety is not a schema property.",
  },
  {
    name: "diagnostic_phrasing",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      phases: [
        {
          ...VALID_ROADMAP.phases[0],
          focus:
            "You probably have a torn meniscus, so avoid loaded knee flexion.",
        },
      ],
    }),
    expected: { outcome: "rejected", reason: "unsafe_content" },
    note: "Non-diagnostic behavior is a product invariant, not a tone preference.",
  },
  {
    name: "too_many_sessions",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: Array.from({ length: 15 }, () => VALID_PLAN.sessions[0]),
    }),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "Volume that no seven day week can hold.",
  },
  {
    name: "empty_plan",
    operation: "create_seven_day_plan",
    body: JSON.stringify({ ...VALID_PLAN, sessions: [] }),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "A well-formed answer that answers nothing.",
  },
  {
    name: "overlapping_phases",
    operation: "create_roadmap",
    body: JSON.stringify({
      ...VALID_ROADMAP,
      phases: [
        VALID_ROADMAP.phases[0],
        { ...VALID_ROADMAP.phases[1], startDate: "2026-08-20" },
      ],
    }),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "Two phases claiming the same weeks.",
  },
];

export function findCoachAIFixtureCase(name: string): CoachAIFixtureCase {
  const fixture = COACH_AI_FIXTURE_CASES.find((entry) => entry.name === name);
  if (!fixture) {
    throw new Error(`Unknown coaching AI fixture case: ${name}`);
  }
  return fixture;
}
