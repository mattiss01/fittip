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
 * Nothing here reaches a network. Every body is a literal in this file, and no
 * body in this file was produced by a provider call made for M3-02.
 */

export const COACH_AI_FIXTURE_TODAY = "2026-08-04";
export const COACH_AI_FIXTURE_HORIZON_START = "2026-08-04";
export const COACH_AI_FIXTURE_HORIZON_END = "2026-11-15";
const PHASE_ONE_END = "2026-09-14";
const PHASE_TWO_START = "2026-09-15";

/** An active, unarchived core goal: the only kind a proposal may target. */
export const COACH_AI_FIXTURE_TARGETABLE_GOAL_ID =
  "a1000000-0000-4000-8000-000000000001";
/** An achieved goal: readable history under ADR-012, never a valid objective. */
export const COACH_AI_FIXTURE_HISTORICAL_GOAL_ID =
  "a1000000-0000-4000-8000-000000000002";
/** A goal this owner does not have. */
export const COACH_AI_FIXTURE_UNOWNED_GOAL_ID =
  "b2000000-0000-4000-8000-0000000000ff";

/**
 * The planning note the corpus validates memory candidates against.
 *
 * It is deliberately mundane owner text. A candidate must quote it character
 * for character after normalization, so the corpus can distinguish "quoted the
 * note" from "wrote something plausible about the note", which is the whole
 * point of decision 4b.
 */
export const COACH_AI_FIXTURE_PLANNING_NOTE =
  "I am away the first weekend of every month. I only have 45 minutes on weekdays.";

export const COACH_AI_FIXTURE_FEEDBACK =
  "The base phase is far too long and the milestones are vague.";

const EMPTY_HISTORY = {
  windowStartDate: "2026-06-10",
  windowEndDate: COACH_AI_FIXTURE_TODAY,
  sessionsInWindow: 0,
  sessionsIncluded: 0,
  completions: [],
  missedPlannedSessions: [],
};

/**
 * The context the corpus is validated against. Its dates are fixed so every
 * assertion is deterministic whatever the wall clock says.
 */
export const COACH_AI_FIXTURE_CONTEXT: CoachAIContext = {
  today: COACH_AI_FIXTURE_TODAY,
  horizonStartDate: COACH_AI_FIXTURE_HORIZON_START,
  horizonEndDate: COACH_AI_FIXTURE_HORIZON_END,
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
  goalsOutsideHorizon: [],
  memory: [
    {
      id: "c3000000-0000-4000-8000-000000000001",
      memoryType: "constraint",
      content: "Trains before work on weekdays.",
    },
  ],
  trainingHistory: EMPTY_HISTORY,
  planCommitments: [],
  hasSafetySignal: false,
  planningNote: COACH_AI_FIXTURE_PLANNING_NOTE,
  regenerationFeedback: null,
  previousProposal: null,
};

/**
 * The same owner with a reported signal on a recent session.
 *
 * It exists so the corpus can prove decision 7 in both directions: generation
 * is never blocked, and a candidate that ignores the signal is rejected.
 */
export const COACH_AI_FIXTURE_SAFETY_CONTEXT: CoachAIContext = {
  ...COACH_AI_FIXTURE_CONTEXT,
  trainingHistory: {
    ...EMPTY_HISTORY,
    sessionsInWindow: 1,
    sessionsIncluded: 1,
    completions: [
      {
        localDate: "2026-08-02",
        status: "completed",
        title: "Hill repeats",
        sport: "Running",
        durationMinutes: 50,
        perceivedEffort: 7,
        feeling: "rough",
        painReported: true,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        note: "Knee twinged on the descents, settled by the evening.",
        replacementDescription: null,
        correctionReason: null,
        activityNames: ["Hill repeats"],
      },
    ],
  },
  hasSafetySignal: true,
};

export type CoachAIFixtureExpectation =
  | {
      outcome: "accepted";
      /** How many memory candidates survive. Absent means zero. */
      memoryCandidates?: number;
      /**
       * True when a valid roadmap arrived with an unusable memory section. The
       * roadmap still returns; the section is discarded (decision 4b).
       */
      memoryRejected?: true;
    }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

export type CoachAIFixtureCase = {
  /** Stable identifier. A script names a case by this. */
  readonly name: string;
  readonly operation: CoachAIOperation;
  /** The exact untrusted body an adapter would return. */
  readonly body: string;
  readonly expected: CoachAIFixtureExpectation;
  /** Defaults to `COACH_AI_FIXTURE_CONTEXT`. */
  readonly context?: CoachAIContext;
  /** Why this failure mode is in the checklist. */
  readonly note: string;
};

const GOAL = COACH_AI_FIXTURE_TARGETABLE_GOAL_ID;

const PHASE_ONE = {
  title: "Aerobic base",
  focus: "Easy volume with one weekly hill circuit, building the engine first.",
  startDate: COACH_AI_FIXTURE_HORIZON_START,
  endDate: PHASE_ONE_END,
  goalAttention: [
    {
      goalId: GOAL,
      level: "primary",
      reason: "The only dated objective inside this horizon.",
    },
  ],
  milestones: [
    {
      title: "Four weeks of three runs",
      observableCriterion:
        "Three runs logged in each of four consecutive weeks.",
      targetDate: "2026-09-07",
      goalIds: [GOAL],
    },
  ],
};

const PHASE_TWO = {
  title: "Race specific",
  focus: "Sustained efforts on course-like terrain, then a short taper.",
  startDate: PHASE_TWO_START,
  endDate: COACH_AI_FIXTURE_HORIZON_END,
  goalAttention: [
    {
      goalId: GOAL,
      level: "primary",
      reason: "Everything in this block serves the race itself.",
    },
  ],
  milestones: [
    {
      title: "Long run over race terrain",
      observableCriterion: "One long run completed on comparable elevation.",
      targetDate: "2026-10-18",
      goalIds: [GOAL],
    },
  ],
};

const VALID_ROADMAP = {
  schemaVersion: "fittip.roadmap.v2",
  title: "Fifteen weeks to a hilly half",
  summary:
    "You have one dated objective and just over three months to reach it, so this splits into a long base block and a shorter race-specific one. The weekday limit you described shapes the base block toward shorter, more frequent runs.",
  startDate: COACH_AI_FIXTURE_HORIZON_START,
  endDate: COACH_AI_FIXTURE_HORIZON_END,
  phases: [PHASE_ONE, PHASE_TWO],
  assumptions: ["Three training days a week are available."],
  uncertainties: [
    {
      statement: "Weekday sessions may stay short for the whole block.",
      whyItMatters: "Hill work needs time that a 45 minute window limits.",
      whatToWatch: "Whether the weekend run is carrying the whole load.",
    },
  ],
  reviewPoints: [
    {
      title: "End of the base block",
      triggerDate: PHASE_ONE_END,
      triggerCondition: null,
      question: "Is the weekly volume holding up alongside work?",
    },
  ],
  safetyConsiderations: null,
};

const envelope = (roadmap: unknown, memoryCandidates: unknown = null): string =>
  JSON.stringify({ roadmap, memoryCandidates });

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const VALID_PLAN = {
  schemaVersion: "fittip.seven-day-plan.v1",
  startDate: "2026-08-04",
  sessions: [
    {
      date: "2026-08-04",
      title: "Easy aerobic run",
      intent: "Time on feet at a conversational effort.",
      durationMinutes: 45,
      goalId: GOAL,
    },
    {
      date: "2026-08-06",
      title: "Hill repeats",
      intent: "Six by two minutes uphill, walking recovery.",
      durationMinutes: 50,
      goalId: GOAL,
    },
  ],
};

function roadmapWith(mutate: (roadmap: Record<string, unknown>) => void) {
  const roadmap = clone(VALID_ROADMAP) as unknown as Record<string, unknown>;
  mutate(roadmap);
  return roadmap;
}

export const COACH_AI_FIXTURE_CASES: readonly CoachAIFixtureCase[] = [
  {
    name: "valid_roadmap",
    operation: "create_roadmap",
    body: envelope(VALID_ROADMAP),
    expected: { outcome: "accepted" },
    note: "The baseline. Contiguous phases covering the exact server horizon.",
  },
  {
    name: "valid_roadmap_with_memory_candidates",
    operation: "create_roadmap",
    body: envelope(VALID_ROADMAP, [
      {
        memoryType: "constraint",
        sourceExcerpt: "I only have 45 minutes on weekdays",
        confidence: 70,
      },
      {
        memoryType: "constraint",
        sourceExcerpt: "I am away the first weekend of every month",
        confidence: null,
      },
    ]),
    expected: { outcome: "accepted", memoryCandidates: 2 },
    note: "Both excerpts are exact substrings of the planning note.",
  },
  {
    name: "memory_candidate_paraphrased",
    operation: "create_roadmap",
    body: envelope(VALID_ROADMAP, [
      {
        memoryType: "constraint",
        sourceExcerpt: "Only has forty-five minutes on weekdays",
        confidence: 90,
      },
    ]),
    expected: { outcome: "accepted", memoryRejected: true },
    note: "A plausible paraphrase is not an excerpt. The roadmap survives; the section does not.",
  },
  {
    name: "memory_candidate_from_feedback_only",
    operation: "create_roadmap",
    body: envelope(VALID_ROADMAP, [
      {
        memoryType: "preference",
        sourceExcerpt: "The base phase is far too long",
        confidence: null,
      },
    ]),
    expected: { outcome: "accepted", memoryRejected: true },
    note: "Text present only in regeneration feedback must never become durable memory.",
  },
  {
    name: "memory_candidates_over_limit",
    operation: "create_roadmap",
    body: envelope(
      VALID_ROADMAP,
      Array.from({ length: 5 }, () => ({
        memoryType: "constraint",
        sourceExcerpt: "I only have 45 minutes on weekdays",
        confidence: null,
      })),
    ),
    expected: { outcome: "accepted", memoryRejected: true },
    note: "Decision 4b caps the section at four; a fifth rejects the batch, not the roadmap.",
  },
  {
    name: "roadmap_horizon_widened",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.endDate = "2027-08-04";
        const phases = roadmap.phases as Record<string, unknown>[];
        phases[1].endDate = "2027-08-04";
      }),
    ),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "ADR-014 decision 4: a note that persuades the model to widen the horizon produces a rejected candidate, not a wider roadmap.",
  },
  {
    name: "roadmap_phase_gap",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        phases[1].startDate = "2026-09-20";
      }),
    ),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "Phases must cover the horizon without gaps; six unplanned days is a gap.",
  },
  {
    name: "overlapping_phases",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        phases[1].startDate = "2026-09-01";
      }),
    ),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "Two phases claiming the same fortnight is not an ordering that can be shown.",
  },
  {
    name: "roadmap_short_of_horizon",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        phases[1].endDate = "2026-10-25";
        (phases[1].milestones as Record<string, unknown>[])[0].targetDate =
          "2026-10-18";
      }),
    ),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "A roadmap that stops three weeks early has not covered what it claims to. The milestone moves with the phase so the date rule cannot mask the coverage rule.",
  },
  {
    name: "roadmap_missing_core_goal",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        for (const phase of phases) {
          (phase.goalAttention as Record<string, unknown>[])[0].goalId =
            COACH_AI_FIXTURE_UNOWNED_GOAL_ID;
        }
      }),
    ),
    expected: { outcome: "rejected", reason: "unowned_goal_reference" },
    note: "An invented goal id is caught before the missing-core-goal rule can see it.",
  },
  {
    name: "historical_goal_reference",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        (phases[0].goalAttention as Record<string, unknown>[])[0].goalId =
          COACH_AI_FIXTURE_HISTORICAL_GOAL_ID;
      }),
    ),
    expected: { outcome: "rejected", reason: "unowned_goal_reference" },
    note: "An achieved goal is background, never an objective. ADR-012.",
  },
  {
    name: "roadmap_milestone_outside_phase",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        (phases[0].milestones as Record<string, unknown>[])[0].targetDate =
          "2026-10-30";
      }),
    ),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "A milestone belongs to the phase that carries it, or the spine cannot place it.",
  },
  {
    name: "roadmap_percentage_attention",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        (phases[0].goalAttention as Record<string, unknown>[])[0].level = "60%";
      }),
    ),
    expected: { outcome: "rejected", reason: "schema" },
    note: "Decision 2 rejected percentages: a 60/40 split looks measurable against no volume.",
  },
  {
    name: "roadmap_review_point_both_triggers",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const points = roadmap.reviewPoints as Record<string, unknown>[];
        points[0].triggerCondition = "If the knee stays sore for a week";
      }),
    ),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "A review point is a date or a condition. Both at once has no display.",
  },
  {
    name: "roadmap_review_point_neither_trigger",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const points = roadmap.reviewPoints as Record<string, unknown>[];
        points[0].triggerDate = null;
      }),
    ),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "Neither has no meaning: the owner is told to reassess at no identifiable moment.",
  },
  {
    name: "roadmap_missing_safety_consideration",
    operation: "create_roadmap",
    body: envelope(VALID_ROADMAP),
    context: COACH_AI_FIXTURE_SAFETY_CONTEXT,
    expected: { outcome: "rejected", reason: "safety_requirement" },
    note: "Decision 7: a reported flag never blocks generation, but the proposal must acknowledge it.",
  },
  {
    name: "roadmap_conservative_under_safety_signal",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.safetyConsiderations = [
          "Descending volume stays flat while the knee is sore; the hill work is time on the climb only.",
        ];
      }),
    ),
    context: COACH_AI_FIXTURE_SAFETY_CONTEXT,
    expected: { outcome: "accepted" },
    note: "The other half of decision 7: a reported flag does not stop a roadmap being produced.",
  },
  {
    name: "diagnostic_phrasing",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.safetyConsiderations = [
          "You probably have a torn meniscus, so avoid loaded knee flexion.",
        ];
      }),
    ),
    context: COACH_AI_FIXTURE_SAFETY_CONTEXT,
    expected: { outcome: "rejected", reason: "unsafe_content" },
    note: "Naming a condition is a diagnosis whatever the surrounding advice says.",
  },
  {
    name: "unsafe_safety_claim",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.safetyConsiderations = [
          "Running downhill is completely safe at this volume.",
        ];
      }),
    ),
    context: COACH_AI_FIXTURE_SAFETY_CONTEXT,
    expected: { outcome: "rejected", reason: "unsafe_content" },
    note: "A claim of safety is a clinical judgement wearing training vocabulary.",
  },
  {
    name: "roadmap_extra_field",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.confidenceScore = 0.82;
      }),
    ),
    expected: { outcome: "rejected", reason: "unknown_field" },
    note: "Decision 3 forbids a confidence score; an unknown field rejects before it can be shown.",
  },
  {
    name: "roadmap_extra_nested_field",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        const phases = roadmap.phases as Record<string, unknown>[];
        phases[0].weeklyVolumeKm = 45;
      }),
    ),
    expected: { outcome: "rejected", reason: "unknown_field" },
    note: "A nested extra field is where a detailed plan would leak into a roadmap.",
  },
  {
    name: "wrong_schema_version",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.schemaVersion = "fittip.roadmap.v1";
      }),
    ),
    expected: { outcome: "rejected", reason: "schema" },
    note: "The v1 shape has no milestones, attention, uncertainties, or review points.",
  },
  {
    name: "roadmap_envelope_extra_field",
    operation: "create_roadmap",
    body: JSON.stringify({
      roadmap: VALID_ROADMAP,
      memoryCandidates: null,
      goalUpdates: [{ id: GOAL, status: "achieved" }],
    }),
    expected: { outcome: "rejected", reason: "unknown_field" },
    note: "The AI cannot mutate a goal, and a field that looks like it could is rejected in full.",
  },
  {
    name: "oversized_payload",
    operation: "create_roadmap",
    body: envelope(
      roadmapWith((roadmap) => {
        roadmap.summary = "x".repeat(40_000);
      }),
    ),
    expected: { outcome: "rejected", reason: "too_large" },
    note: "Size is checked before anything parses it.",
  },
  {
    name: "truncated_json",
    operation: "create_roadmap",
    body: '{"roadmap":{"schemaVersion":"fittip.roadmap.v2","title":"Fifteen weeks',
    expected: { outcome: "rejected", reason: "unparsable" },
    note: "What an output-token ceiling actually produces.",
  },
  {
    name: "prose_fallback",
    operation: "create_roadmap",
    body: "Here is a roadmap for you. Start with six weeks of easy base work, then add hills.",
    expected: { outcome: "rejected", reason: "unparsable" },
    note: "Prose is never salvaged into a proposal.",
  },
  {
    name: "json_array_body",
    operation: "create_roadmap",
    body: '[{"roadmap":{}}]',
    expected: { outcome: "rejected", reason: "schema" },
    note: "A top-level array is well-formed JSON and still not the contract.",
  },
  {
    name: "valid_seven_day_plan",
    operation: "create_seven_day_plan",
    body: JSON.stringify(VALID_PLAN),
    expected: { outcome: "accepted" },
    note: "The M3-01 baseline, unchanged. M3-03 owns this operation.",
  },
  {
    name: "session_outside_plan_week",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [{ ...VALID_PLAN.sessions[0], date: "2026-09-04" }],
    }),
    expected: { outcome: "rejected", reason: "impossible_date" },
    note: "A session a month out is not part of the week that was requested.",
  },
  {
    name: "impossible_duration",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [{ ...VALID_PLAN.sessions[0], durationMinutes: 900 }],
    }),
    expected: { outcome: "rejected", reason: "invalid_duration" },
    note: "Fifteen hours is not a session.",
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
    note: "A goal id this owner does not have must never round-trip into a proposal.",
  },
  {
    name: "unsafe_medical_phrasing",
    operation: "create_seven_day_plan",
    body: JSON.stringify({
      ...VALID_PLAN,
      sessions: [
        {
          ...VALID_PLAN.sessions[0],
          intent: "Push through the pain and take ibuprofen beforehand.",
        },
      ],
    }),
    expected: { outcome: "rejected", reason: "unsafe_content" },
    note: "Two prohibited behaviours in one sentence: ignoring a signal, and medication.",
  },
  {
    name: "empty_plan",
    operation: "create_seven_day_plan",
    body: JSON.stringify({ ...VALID_PLAN, sessions: [] }),
    expected: { outcome: "rejected", reason: "business_rule" },
    note: "A week with no sessions is a refusal dressed as a plan.",
  },
];

export function findCoachAIFixtureCase(name: string): CoachAIFixtureCase {
  const found = COACH_AI_FIXTURE_CASES.find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`Unknown coach AI fixture case: ${name}`);
  }
  return found;
}

export function coachAIFixtureContext(
  fixture: CoachAIFixtureCase,
): CoachAIContext {
  return fixture.context ?? COACH_AI_FIXTURE_CONTEXT;
}
