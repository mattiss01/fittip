import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  ROADMAP_GOAL_ATTENTION_LEVELS,
  type CoachAIContext,
  type CoachAIOperation,
  type CoachAIProposal,
  type CoachAIUncertainty,
  type RoadmapGoalAttention,
  type RoadmapGoalAttentionLevel,
  type RoadmapMemoryCandidate,
  type RoadmapMilestone,
  type RoadmapPhase,
  type RoadmapProposal,
  type RoadmapResponse,
  type ProposedSessionActivity,
  type SessionActivitiesProposal,
  type SevenDayPlanAlternative,
  type SevenDayPlanProposal,
  type SevenDayPlanResponse,
  type SevenDayPlanSession,
} from "@/server/ai/contracts";
import { byteLength } from "@/server/ai/context";
import {
  MEMORY_CANDIDATE_MAX_LENGTH,
  normalizeOwnerText,
} from "@/server/ai/owner-text";
import {
  PLAN_MAX_DAY_COUNT,
  PLAN_MIN_DAY_COUNT,
} from "@/server/ai/plan-horizon";
import { MEMORY_TYPES, type MemoryType } from "@/server/memory/memory-records";
import {
  parseTrainingMeasurement,
  TARGET_TEXT_MAX,
  TRAINING_MEASUREMENT_MODES,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

/**
 * Output validation. Provider output is untrusted text: it is size-bounded
 * before parsing, parsed only as strict JSON, and accepted only if every field
 * matches the operation schema exactly. Partial validity is not partial
 * acceptance — one bad field rejects the whole candidate, and a rejected
 * candidate creates no proposal and writes nothing. Length is the exception
 * (owner, 17 Oct 2026): text over its limit is cut to fit, and a prose list
 * longer than allowed keeps its first entries, because the model counts badly
 * and a paid answer refused over one character helps nobody.
 *
 * Prose is never salvaged into a plan. A model that answers in sentences has
 * failed the contract, and guessing at its intent is how an unchecked plan
 * reaches a user.
 *
 * This module is also where ADR-014 decision 4 is actually enforced. The
 * planning note may inform what the coach proposes; it may not change what the
 * system accepts. Nothing here reads the note as instruction: the horizon, the
 * schema, the eligible goal set, and every limit are values the server derived
 * and the model never saw, and they are compared against the response after it
 * returns. A note that successfully persuades the model to widen the horizon
 * produces a rejected candidate, not a wider roadmap.
 */

export const COACH_AI_REJECTION_REASONS = [
  "too_large",
  "unparsable",
  "schema",
  "unknown_field",
  "impossible_date",
  "invalid_duration",
  "unowned_goal_reference",
  "unsafe_content",
  "safety_requirement",
  "business_rule",
] as const;

export type CoachAIRejectionReason =
  (typeof COACH_AI_REJECTION_REASONS)[number];

export type CoachAIValidationResult =
  | { outcome: "accepted"; proposal: CoachAIProposal }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/**
 * The roadmap operation returns two independently validated sections, so it
 * has its own result type: an invalid memory section is discarded while a valid
 * roadmap remains reviewable (decision 4b).
 */
export type RoadmapValidationResult =
  | {
      outcome: "accepted";
      response: RoadmapResponse;
      /** Present when a valid roadmap arrived with an unusable memory section. */
      memoryRejectionReason: CoachAIRejectionReason | null;
    }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/** The plan operation's two independently validated sections. */
export type PlanValidationResult =
  | {
      outcome: "accepted";
      response: SevenDayPlanResponse;
      /** Present when a valid plan arrived with an unusable memory section. */
      memoryRejectionReason: CoachAIRejectionReason | null;
    }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/** The fill operation has one section: there is no note to extract memory from. */
export type SessionActivitiesValidationResult =
  | { outcome: "accepted"; proposal: SessionActivitiesProposal }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

export const COACH_AI_MAX_OUTPUT_BYTES = 16_000;

/** Decision 2's bounds. Serialized roadmap content is capped separately. */
export const ROADMAP_CONTENT_MAX_BYTES = 16_000;
const MAX_PHASES = 6;
const MIN_PHASES = 1;
const MAX_MILESTONES_PER_PHASE = 3;
const MAX_ATTENTION_PER_PHASE = 4;
const MAX_UNCERTAINTIES = 4;
const MAX_MEMORY_CANDIDATES = 4;

/**
 * M3-03 decision 4, replacing the shipped `MAX_SESSIONS_PER_DAY = 2` and
 * `MAX_SESSIONS = 14`.
 *
 * Three per day, because a real day can hold a short morning mobility session,
 * a run, and a gym session. The horizon maximum follows as `3 x dayCount`
 * rather than a fixed number, because the horizon is no longer always a week.
 *
 * Both are **structural output bounds, not training rules**. They exist so a
 * malformed or runaway response is rejected rather than parsed, and they are
 * set where an owner would not meet them in ordinary use. There is deliberately
 * no minutes cap and no required rest day: neither is a rule the server should
 * own, and a horizon with neither must not be rejected for lacking one.
 */
const MAX_SESSIONS_PER_DAY = 3;

export function maxSessionsForHorizon(dayCount: number): number {
  return MAX_SESSIONS_PER_DAY * dayCount;
}

const MAX_SECONDARY_GOALS_PER_SESSION = 6;
const MAX_ALTERNATIVES_PER_SESSION = 2;
const MAX_PLAN_ASSUMPTIONS = 4;
const MAX_PLAN_UNCERTAINTIES = 3;
const MAX_PLAN_SAFETY_CONSIDERATIONS = 3;
const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The cap on the stored plan envelope, separate from one response's body. */
export const PLAN_CONTENT_MAX_BYTES = 16_000;

/**
 * A conservative, deliberately non-exhaustive deny list. It is a backstop for
 * non-diagnostic behavior, not a safety classifier: passing it does not make a
 * candidate safe. Note what is deliberately absent — nothing here classifies
 * *severity*. M3-02 decision 7 forbids a free-text severity classifier, an
 * elapsed-time clearance rule, or an inferred resolved state, because the model
 * holds no reliable structured state for any of them.
 */
const UNSAFE_PATTERNS: readonly RegExp[] = [
  /\bdiagnos(e|ed|es|is|ing)\b/i,
  /\bprescrib(e|ed|es|ing)\b/i,
  /\bprescription\b/i,
  /\b(medication|dosage|painkillers?|ibuprofen|cortisone)\b/i,
  /\b(cure|heal|treat) (your|the) \w+/i,
  /\bpush through (the |your )?pain\b/i,
  /\bignore (the|your) (pain|injury|symptoms?)\b/i,
  /\byou (probably |likely )?have (a |an )?(torn|fracture|sprain|tendinitis|tendonitis)/i,
  // Claims of safety are prohibited alongside diagnosis and treatment: "this is
  // safe for your knee" is a clinical judgement wearing training vocabulary.
  /\b(is|are|will be|stays?|remains?) (perfectly |completely |entirely |quite |totally )?safe\b/i,
  /\bsafe to (train|run|lift|push) (on|through)\b/i,
];

/**
 * The server-owned static copy. Decision 7 fixes the wording, and nothing in a
 * response may replace, edit, or paraphrase it — which is why it lives here as
 * a constant and never travels to the provider as something to reproduce.
 */
export const ROADMAP_SAFETY_NOTICE =
  "FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, " +
  "or getting worse, stop the affected activity and contact a qualified " +
  "health professional.";

export function validateCoachAICandidate(input: {
  operation: CoachAIOperation;
  body: string;
  context: CoachAIContext;
  maxBytes?: number;
}): CoachAIValidationResult {
  switch (input.operation) {
    case "create_roadmap": {
      const result = validateRoadmapCandidate(input);
      return result.outcome === "accepted"
        ? { outcome: "accepted", proposal: result.response.roadmap }
        : result;
    }
    case "create_seven_day_plan": {
      const result = validatePlanCandidate(input);
      return result.outcome === "accepted"
        ? { outcome: "accepted", proposal: result.response.plan }
        : result;
    }
    case "fill_session_activities":
      return validateSessionActivitiesCandidate(input);
    default: {
      // A fourth operation must choose its validator; it cannot fall into one.
      const unreachable: never = input.operation;
      return unreachable;
    }
  }
}

/** A7-2's bounds. Structural output limits, not training rules. */
export const SESSION_ACTIVITIES_MAX = 12;
const SESSION_ACTIVITY_NAME_MAX = 120;
const SESSION_ACTIVITY_SPORT_MAX = 80;
const SESSION_ACTIVITY_INSTRUCTIONS_MAX = 500;
const SESSION_ACTIVITY_RATIONALE_MAX = 300;
const SESSION_ACTIVITIES_SUMMARY_MAX = 400;
const SESSION_ACTIVITIES_SAFETY_MAX = 3;
/** The cap on the stored proposal, separate from one response's body. */
export const SESSION_ACTIVITIES_CONTENT_MAX_BYTES = 16_000;

/**
 * The fill entry point: size, parse, structure, then content safety last.
 *
 * Two properties are the server's and never the model's. A library link must
 * name an entry that was *sent*, which is the owner's own active library; the
 * entry's name, sport and mode are then copied from the context rather than
 * taken from the response, so a misspelt name cannot drift from the definition
 * it links. And every target is parsed by `parseTrainingMeasurement`, the same
 * function the plan editor's save runs, so a proposal the owner saves unchanged
 * is one `apply_rolling_plan_change_set` accepts.
 */
export function validateSessionActivitiesCandidate(input: {
  body: string;
  context: CoachAIContext;
  maxBytes?: number;
}): SessionActivitiesValidationResult {
  const maxBytes = input.maxBytes ?? COACH_AI_MAX_OUTPUT_BYTES;
  if (byteLength(input.body) > maxBytes) return rejected("too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return rejected("unparsable");
  }
  if (!isRecord(parsed)) return rejected("schema");
  if (
    findUnknownField(parsed, [
      "schemaVersion",
      "summary",
      "activities",
      "safetyConsiderations",
    ])
  ) {
    return rejected("unknown_field");
  }

  const detail = input.context.sessionDetail;
  const summary = readProse(parsed.summary, SESSION_ACTIVITIES_SUMMARY_MAX);
  if (
    detail === null ||
    parsed.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.fill_session_activities ||
    summary === null ||
    !Array.isArray(parsed.activities)
  ) {
    return rejected("schema");
  }
  if (
    parsed.activities.length < 1 ||
    parsed.activities.length > SESSION_ACTIVITIES_MAX
  ) {
    return rejected("business_rule");
  }

  const library = new Map(detail.library.map((entry) => [entry.id, entry]));
  // Ids the coach was shown on an activity without being sent the definition:
  // one trimmed from the library to fit, or archived since the session was
  // written. Told to keep what fits, a coach will keep those ids, and refusing
  // a paid answer for doing what it was asked is a refusal nobody can act on.
  // Such a row keeps its own name and becomes session-only instead.
  const mentioned = new Set(
    [
      ...detail.session.activities,
      ...detail.savedSessions.flatMap((saved) => saved.activities),
      ...detail.recentActuals,
    ]
      .map((activity) => activity.personalActivityId)
      .filter((id): id is string => id !== null && !library.has(id)),
  );
  const activities: ProposedSessionActivity[] = [];
  for (const entry of parsed.activities) {
    const activity = validateProposedActivity(entry, library, mentioned);
    if (activity.outcome === "rejected") return activity;
    activities.push(activity.activity);
  }

  const safetyConsiderations = validateStringArray(
    parsed.safetyConsiderations,
    SESSION_ACTIVITIES_SAFETY_MAX,
    240,
  );
  // Blank entries never reach `finish_session_activity_generation`, which
  // refuses them: `validateStringArray` drops them (A7-3 review).
  if (safetyConsiderations === null) return rejected("business_rule");

  const proposal: SessionActivitiesProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.fill_session_activities,
    summary,
    activities,
    ...(safetyConsiderations.length > 0 ? { safetyConsiderations } : {}),
  };

  if (
    containsUnsafeContent([
      proposal.summary,
      ...safetyConsiderations,
      ...activities.flatMap((activity) => [
        activity.name,
        activity.sport,
        activity.rationale,
        ...(activity.instructions === null ? [] : [activity.instructions]),
        // A custom target's label, value and unit are free text too.
        ...targetStrings(activity.target),
      ]),
    ])
  ) {
    return rejected("unsafe_content");
  }

  // As for plans and roadmaps: a present flag never blocks generation, but a
  // list that does not acknowledge it has not acknowledged what was reported.
  if (input.context.hasSafetySignal && safetyConsiderations.length === 0) {
    return rejected("safety_requirement");
  }

  if (
    byteLength(JSON.stringify(proposal)) > SESSION_ACTIVITIES_CONTENT_MAX_BYTES
  ) {
    return rejected("too_large");
  }

  return { outcome: "accepted", proposal };
}

type ProposedActivityResult =
  | { outcome: "accepted"; activity: ProposedSessionActivity }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

function validateProposedActivity(
  entry: unknown,
  library: ReadonlyMap<
    string,
    { name: string; sport: string; measurementMode: TrainingMeasurementMode }
  >,
  mentioned: ReadonlySet<string>,
): ProposedActivityResult {
  if (!isRecord(entry)) return rejected("schema");
  if (
    findUnknownField(entry, [
      "personalActivityId",
      "name",
      "sport",
      "instructions",
      "measurementMode",
      "target",
      "rationale",
    ])
  ) {
    return rejected("unknown_field");
  }
  const rationale = readProse(entry.rationale, SESSION_ACTIVITY_RATIONALE_MAX);
  const instructions =
    entry.instructions === null || entry.instructions === undefined
      ? null
      : readProse(entry.instructions, SESSION_ACTIVITY_INSTRUCTIONS_MAX);
  if (
    !isMeasurementMode(entry.measurementMode) ||
    rationale === null ||
    (instructions === null &&
      entry.instructions !== null &&
      entry.instructions !== undefined) ||
    !(
      entry.personalActivityId === null ||
      entry.personalActivityId === undefined ||
      typeof entry.personalActivityId === "string"
    )
  ) {
    return rejected("schema");
  }

  let name: string;
  let sport: string;
  let personalActivityId: string | null = null;
  // A mentioned-but-unsent id falls through to a session-only row below.
  const linkedId =
    typeof entry.personalActivityId === "string" &&
    !mentioned.has(entry.personalActivityId)
      ? entry.personalActivityId
      : null;
  if (linkedId !== null) {
    const linked = library.get(linkedId);
    // An id that was never shown is not the owner's to link, whatever it is.
    if (!linked) return rejected("business_rule");
    if (linked.measurementMode !== entry.measurementMode) {
      return rejected("business_rule");
    }
    personalActivityId = linkedId;
    name = linked.name;
    sport = linked.sport;
  } else {
    const ownName = readProse(entry.name, SESSION_ACTIVITY_NAME_MAX);
    const ownSport = readProse(entry.sport, SESSION_ACTIVITY_SPORT_MAX);
    if (ownName === null || ownSport === null) return rejected("schema");
    name = ownName.trim();
    sport = ownSport.trim();
  }

  const target = readTarget(entry.measurementMode, entry.target);
  if (target === undefined) return rejected("schema");

  return {
    outcome: "accepted",
    activity: {
      personalActivityId,
      name,
      sport,
      instructions,
      measurementMode: entry.measurementMode,
      target,
      rationale,
    },
  };
}

/**
 * The grammar's all-fields-nullable target, reduced to the mode's own shape.
 * Nulls are dropped, including inside set groups; nothing left means no target.
 * `undefined` means refused.
 */
function readTarget(
  mode: TrainingMeasurementMode,
  value: unknown,
): TrainingMeasurement | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return undefined;

  const present: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === null) continue;
    if (key === "groups" && Array.isArray(field)) {
      present.groups = field.map((group) =>
        isRecord(group)
          ? Object.fromEntries(
              Object.entries(group).filter(([, part]) => part !== null),
            )
          : group,
      );
      continue;
    }
    // A target's own words are cut to the editor's limits, as the coach's
    // other text is, rather than refusing the list.
    const textMax = (TARGET_TEXT_MAX as Readonly<Record<string, number>>)[key];
    present[key] =
      typeof field === "string" && textMax !== undefined
        ? fitText(field, textMax)
        : field;
  }
  if (Object.keys(present).length === 0) return null;
  // The flat form is readable history, not something to write; the grammar
  // cannot produce it, so a body carrying it did not come through the grammar.
  if (mode === "sets_reps_load" && !("groups" in present)) return undefined;

  try {
    return parseTrainingMeasurement(mode, present);
  } catch {
    return undefined;
  }
}

/** The free text a target can carry, for the content check. */
function targetStrings(target: TrainingMeasurement | null): string[] {
  if (target === null) return [];
  return Object.values(target).filter(
    (value): value is string => typeof value === "string",
  );
}

function isMeasurementMode(value: unknown): value is TrainingMeasurementMode {
  return (
    typeof value === "string" &&
    (TRAINING_MEASUREMENT_MODES as readonly string[]).includes(value)
  );
}

/**
 * The plan entry point. Size first, then parse, then the two sections
 * separately, then content safety last so its rejections are not masked by a
 * structural failure that would have rejected the candidate anyway.
 */
export function validatePlanCandidate(input: {
  body: string;
  context: CoachAIContext;
  maxBytes?: number;
}): PlanValidationResult {
  const maxBytes = input.maxBytes ?? COACH_AI_MAX_OUTPUT_BYTES;

  // Size before anything parses it. An oversized body is exactly what a parser
  // would be asked to absorb first.
  if (byteLength(input.body) > maxBytes) return rejected("too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return rejected("unparsable");
  }
  if (!isRecord(parsed)) return rejected("schema");
  if (findUnknownField(parsed, ["plan", "memoryCandidates"])) {
    return rejected("unknown_field");
  }
  if (!isRecord(parsed.plan)) return rejected("schema");

  const targetableGoalIds = new Set(
    input.context.targetableGoals.map((goal) => goal.id),
  );
  const planResult = validateSevenDayPlan(
    parsed.plan,
    input.context,
    targetableGoalIds,
  );
  if (planResult.outcome === "rejected") return planResult;
  const plan = planResult.proposal as SevenDayPlanProposal;

  if (containsUnsafeContent(collectPlanStrings(plan))) {
    return rejected("unsafe_content");
  }

  const memory = validateMemoryCandidates(
    parsed.memoryCandidates,
    input.context.planningNote,
  );

  return {
    outcome: "accepted",
    response: {
      plan,
      memoryCandidates: memory.outcome === "accepted" ? memory.candidates : [],
    },
    memoryRejectionReason: memory.outcome === "rejected" ? memory.reason : null,
  };
}

/**
 * The roadmap entry point. Size first, then parse, then the two sections
 * separately, then content safety last so its rejections are not masked by a
 * structural failure that would have rejected the candidate anyway.
 */
export function validateRoadmapCandidate(input: {
  body: string;
  context: CoachAIContext;
  maxBytes?: number;
}): RoadmapValidationResult {
  const maxBytes = input.maxBytes ?? COACH_AI_MAX_OUTPUT_BYTES;

  // Size before anything parses it. An oversized body is exactly what a parser
  // would be asked to absorb first.
  if (byteLength(input.body) > maxBytes) return rejected("too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return rejected("unparsable");
  }
  if (!isRecord(parsed)) return rejected("schema");
  if (findUnknownField(parsed, ["roadmap", "memoryCandidates"])) {
    return rejected("unknown_field");
  }

  const roadmapResult = validateRoadmap(parsed.roadmap, input.context);
  if (roadmapResult.outcome === "rejected") return roadmapResult;
  const roadmap = roadmapResult.roadmap;

  if (containsUnsafeContent(collectRoadmapStrings(roadmap))) {
    return rejected("unsafe_content");
  }

  // No safety requirement since v3 (ADR-025): a roadmap holds no safety
  // sentences, so a present flag constrains nothing here. The coach is still
  // sent the flag and the safety rules, and the plan and the fill still have
  // to acknowledge one.

  // The two sections validate independently. A memory section that fails is
  // discarded; it never weakens or invalidates a roadmap that passed.
  const memory = validateMemoryCandidates(
    parsed.memoryCandidates,
    input.context.planningNote,
  );

  return {
    outcome: "accepted",
    response: {
      roadmap,
      memoryCandidates: memory.outcome === "accepted" ? memory.candidates : [],
    },
    memoryRejectionReason: memory.outcome === "rejected" ? memory.reason : null,
  };
}

type RoadmapSectionResult =
  | { outcome: "accepted"; roadmap: RoadmapProposal }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

function validateRoadmap(
  value: unknown,
  context: CoachAIContext,
): RoadmapSectionResult {
  if (!isRecord(value)) return rejected("schema");

  if (
    findUnknownField(value, [
      "schemaVersion",
      "title",
      "summary",
      "startDate",
      "endDate",
      "phases",
    ])
  ) {
    return rejected("unknown_field");
  }

  const title = readText(value.title, 80);
  // Optional since 14 October 2026 (owner): a roadmap written by hand may
  // have none. The coach's grammar still asks for one.
  const summary = readOptionalText(value.summary, 600);
  if (
    value.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_roadmap ||
    title === null ||
    summary === null ||
    !Array.isArray(value.phases)
  ) {
    return rejected("schema");
  }

  // The horizon is the server's, not the model's and not the note's. Comparing
  // it here is the whole of ADR-014 decision 4's first bullet.
  if (
    value.startDate !== context.horizonStartDate ||
    value.endDate !== context.horizonEndDate
  ) {
    return rejected("impossible_date");
  }

  const horizonStartMs = parseIsoDate(context.horizonStartDate);
  const horizonEndMs = parseIsoDate(context.horizonEndDate);
  if (horizonStartMs === null || horizonEndMs === null) {
    return rejected("impossible_date");
  }

  if (value.phases.length < MIN_PHASES || value.phases.length > MAX_PHASES) {
    return rejected("business_rule");
  }

  const targetableGoalIds = new Set(context.targetableGoals.map((g) => g.id));

  const phases: RoadmapPhase[] = [];
  let expectedStartMs = horizonStartMs;

  for (const entry of value.phases) {
    const phase = validatePhase(entry, {
      targetableGoalIds,
      horizonEndMs,
      expectedStartMs,
    });
    if (phase.outcome === "rejected") return phase;
    phases.push(phase.phase);
    // Contiguous and non-overlapping: the next phase starts the day after this
    // one ends. Gaps and overlaps are both business-rule failures rather than
    // date failures, because each date on its own is well formed.
    expectedStartMs = (parseIsoDate(phase.phase.endDate) as number) + DAY_MS;
  }

  // Phases must cover the horizon without gaps, so the last one ends on it.
  if (expectedStartMs !== horizonEndMs + DAY_MS) {
    return rejected("business_rule");
  }

  // ADR-014 decision 2 asked that every active core goal appear in a phase.
  // The owner deleted that rule on 14 October 2026, for the coach and for a
  // roadmap written by hand alike: a roadmap may leave a goal out.

  const roadmap: RoadmapProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_roadmap,
    title,
    ...(summary === undefined ? {} : { summary }),
    startDate: value.startDate,
    endDate: value.endDate,
    phases,
  };

  // The stored envelope is capped independently of the response body, because
  // what is persisted forever is a different question from what one response
  // was allowed to weigh.
  if (byteLength(JSON.stringify(roadmap)) > ROADMAP_CONTENT_MAX_BYTES) {
    return rejected("too_large");
  }

  return { outcome: "accepted", roadmap };
}

type PhaseResult =
  | { outcome: "accepted"; phase: RoadmapPhase }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

function validatePhase(
  entry: unknown,
  bounds: {
    targetableGoalIds: Set<string>;
    horizonEndMs: number;
    expectedStartMs: number;
  },
): PhaseResult {
  if (!isRecord(entry)) return rejected("schema");
  if (
    findUnknownField(entry, [
      "title",
      "focus",
      "startDate",
      "endDate",
      "goalAttention",
      "milestones",
    ])
  ) {
    return rejected("unknown_field");
  }
  const title = readText(entry.title, 80);
  const focus = readText(entry.focus, 300);
  if (
    title === null ||
    focus === null ||
    !Array.isArray(entry.goalAttention) ||
    !Array.isArray(entry.milestones)
  ) {
    return rejected("schema");
  }

  const startMs = parseIsoDate(entry.startDate);
  const endMs = parseIsoDate(entry.endDate);
  if (startMs === null || endMs === null) return rejected("impossible_date");
  if (endMs < startMs || endMs > bounds.horizonEndMs) {
    return rejected("impossible_date");
  }
  if (startMs !== bounds.expectedStartMs) return rejected("business_rule");

  // None is allowed since v3: a phase with no honest checkpoint has none. Past
  // three, the first three are kept rather than the roadmap refused.
  if (
    entry.goalAttention.length < 1 ||
    entry.goalAttention.length > MAX_ATTENTION_PER_PHASE
  ) {
    return rejected("business_rule");
  }

  const goalAttention: RoadmapGoalAttention[] = [];
  const seenGoalIds = new Set<string>();
  for (const attention of entry.goalAttention) {
    if (!isRecord(attention)) return rejected("schema");
    if (findUnknownField(attention, ["goalId", "level"])) {
      return rejected("unknown_field");
    }
    if (
      typeof attention.goalId !== "string" ||
      !isAttentionLevel(attention.level)
    ) {
      return rejected("schema");
    }
    // Only goals the owner may actually be coached toward. An achieved goal is
    // readable history under ADR-012 and is never a valid objective.
    if (!bounds.targetableGoalIds.has(attention.goalId)) {
      return rejected("unowned_goal_reference");
    }
    if (seenGoalIds.has(attention.goalId)) return rejected("business_rule");
    seenGoalIds.add(attention.goalId);

    goalAttention.push({
      goalId: attention.goalId,
      level: attention.level,
    });
  }

  const milestones: RoadmapMilestone[] = [];
  for (const milestone of entry.milestones.slice(0, MAX_MILESTONES_PER_PHASE)) {
    if (!isRecord(milestone)) return rejected("schema");
    if (
      findUnknownField(milestone, [
        "title",
        "observableCriterion",
        "targetDate",
        "goalIds",
      ])
    ) {
      return rejected("unknown_field");
    }
    const milestoneTitle = readText(milestone.title, 80);
    // "Details", optional since 14 October 2026 (owner).
    const observableCriterion = readOptionalText(
      milestone.observableCriterion,
      200,
    );
    if (
      milestoneTitle === null ||
      observableCriterion === null ||
      !Array.isArray(milestone.goalIds)
    ) {
      return rejected("schema");
    }

    const targetMs = parseIsoDate(milestone.targetDate);
    if (targetMs === null) return rejected("impossible_date");
    // A milestone belongs to the phase that carries it.
    if (targetMs < startMs || targetMs > endMs) {
      return rejected("impossible_date");
    }

    // A milestone may name no goal (owner, 14 Oct 2026): "Counts toward" is
    // optional on the form, and the coach's grammar still asks for one. Past
    // four, the first four are kept.
    const goalIds = milestone.goalIds.slice(0, MAX_ATTENTION_PER_PHASE);
    for (const goalId of goalIds) {
      if (typeof goalId !== "string") return rejected("schema");
      if (!bounds.targetableGoalIds.has(goalId)) {
        return rejected("unowned_goal_reference");
      }
    }

    milestones.push({
      title: milestoneTitle,
      ...(observableCriterion === undefined ? {} : { observableCriterion }),
      targetDate: milestone.targetDate as string,
      goalIds: [...(goalIds as string[])],
    });
  }

  return {
    outcome: "accepted",
    phase: {
      title,
      focus,
      startDate: entry.startDate as string,
      endDate: entry.endDate as string,
      goalAttention,
      milestones,
    },
  };
}

/**
 * Returns `null` on any failure, so the caller rejects the whole candidate.
 * Past `maxItems` the first ones are kept, and each is cut to fit.
 */
function validateStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const entries = value.slice(0, maxItems);
  if (!entries.every((entry) => typeof entry === "string")) return null;
  // A blank entry says nothing, so it is dropped rather than refused, and
  // never counts as the safety note a reported signal requires.
  return entries
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => fitText(withoutSemicolons(entry), maxLength));
}

function validateUncertainties(
  value: unknown,
  maxItems: number = MAX_UNCERTAINTIES,
): CoachAIUncertainty[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const uncertainties: CoachAIUncertainty[] = [];
  for (const entry of value.slice(0, maxItems)) {
    if (!isRecord(entry)) return null;
    if (findUnknownField(entry, ["statement", "whyItMatters", "whatToWatch"])) {
      return null;
    }
    const statement = readText(entry.statement, 200);
    const whyItMatters = readText(entry.whyItMatters, 200);
    const whatToWatch = readText(entry.whatToWatch, 200);
    if (statement === null || whyItMatters === null || whatToWatch === null) {
      return null;
    }
    uncertainties.push({ statement, whyItMatters, whatToWatch });
  }
  return uncertainties;
}

type MemorySectionResult =
  | { outcome: "accepted"; candidates: RoadmapMemoryCandidate[] }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/**
 * Decision 4b and ADR-015 function 3, as ADR-010 decision 16 now reads.
 *
 * A candidate is one sentence in the coach's own words (owner, 18 Oct 2026):
 * the exact-excerpt rule meant suggestions almost never appeared. It still
 * needs a planning note to exist, because the note is the only thing the
 * coach is told to draw on, and it stays a proposal the owner decides on.
 * Nothing here can prove the sentence came from the note rather than the
 * feedback; the prompt says so and the owner's review is the check.
 *
 * One bad candidate rejects the whole batch, matching the database, so the
 * application and `record_roadmap_memory_candidates` never disagree about which
 * candidates exist.
 */
export function validateMemoryCandidates(
  value: unknown,
  planningNote: string | null,
): MemorySectionResult {
  if (value === undefined || value === null) {
    return { outcome: "accepted", candidates: [] };
  }
  if (!Array.isArray(value)) return rejected("schema");
  if (value.length === 0) return { outcome: "accepted", candidates: [] };

  // With no planning note there is nothing a candidate could be drawn from.
  if (planningNote === null) return rejected("business_rule");

  // Past four, the first four are kept (owner, 17 Oct 2026).
  const candidates: RoadmapMemoryCandidate[] = [];
  for (const entry of value.slice(0, MAX_MEMORY_CANDIDATES)) {
    if (!isRecord(entry)) return rejected("schema");
    if (findUnknownField(entry, ["memoryType", "content", "confidence"])) {
      return rejected("unknown_field");
    }
    if (!isMemoryType(entry.memoryType)) return rejected("schema");
    if (typeof entry.content !== "string") return rejected("schema");

    // Normalized the way the database normalizes it, then cut to fit.
    const content = readProse(
      normalizeOwnerText(entry.content),
      MEMORY_CANDIDATE_MAX_LENGTH,
    );
    if (content === null) return rejected("business_rule");

    let confidence: number | undefined;
    if (entry.confidence !== undefined && entry.confidence !== null) {
      if (
        typeof entry.confidence !== "number" ||
        !Number.isSafeInteger(entry.confidence) ||
        entry.confidence < 0 ||
        entry.confidence > 100
      ) {
        return rejected("schema");
      }
      confidence = entry.confidence;
    }

    candidates.push({
      memoryType: entry.memoryType,
      content,
      ...(confidence === undefined ? {} : { confidence }),
    });
  }

  return { outcome: "accepted", candidates };
}

/**
 * `fittip.seven-day-plan.v2`.
 *
 * The horizon is the server's. `startDate` and `endDate` are compared against
 * the values the server derived and the model never chose, which is how a
 * model — or a planning note that persuaded one — cannot widen, shorten, or
 * shift the requested days. Every session date is then checked against that
 * same range, so a horizon that passed and sessions that did not cannot
 * disagree.
 */
function validateSevenDayPlan(
  parsed: Record<string, unknown>,
  context: CoachAIContext,
  targetableGoalIds: Set<string>,
): CoachAIValidationResult {
  if (
    findUnknownField(parsed, [
      "schemaVersion",
      "weekDescription",
      "startDate",
      "endDate",
      "sessions",
      "assumptions",
      "uncertainties",
      "safetyConsiderations",
    ])
  ) {
    return rejected("unknown_field");
  }

  const weekDescription = readText(parsed.weekDescription, 600);
  if (
    parsed.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan ||
    weekDescription === null ||
    !Array.isArray(parsed.sessions)
  ) {
    return rejected("schema");
  }

  if (
    parsed.startDate !== context.horizonStartDate ||
    parsed.endDate !== context.horizonEndDate
  ) {
    return rejected("impossible_date");
  }

  const startMs = parseIsoDate(context.horizonStartDate);
  const endMs = parseIsoDate(context.horizonEndDate);
  if (startMs === null || endMs === null || endMs < startMs) {
    return rejected("impossible_date");
  }

  const dayCount = Math.round((endMs - startMs) / DAY_MS) + 1;
  if (dayCount < PLAN_MIN_DAY_COUNT || dayCount > PLAN_MAX_DAY_COUNT) {
    return rejected("impossible_date");
  }

  // No sessions is an answer (owner, 17 October 2026): a week that already
  // holds what it should is left as it is, and the week description says why.
  if (parsed.sessions.length > maxSessionsForHorizon(dayCount)) {
    return rejected("business_rule");
  }

  const sessions: SevenDayPlanSession[] = [];
  const perDay = new Map<string, number>();
  // ADR-024. The handles this request issued: one per session the owner
  // marked "can be replaced". The database holds the answer to the same set.
  const replaceHandles = new Set(
    context.planCommitments
      .map((commitment) => commitment.replaceHandle)
      .filter((handle): handle is string => typeof handle === "string"),
  );
  const replaced = new Set<string>();

  for (const entry of parsed.sessions) {
    const session = validatePlanSession(entry, { startMs, endMs });
    if (session.outcome === "rejected") return session;

    // Every referenced goal is one the owner may currently be coached toward.
    // An achieved goal is readable history under ADR-012 and is never a valid
    // objective, so `historicalGoals` is deliberately not in this set.
    if (!targetableGoalIds.has(session.session.primaryGoalId)) {
      return rejected("unowned_goal_reference");
    }
    const secondaries = session.session.secondaryGoalIds ?? [];
    for (const goalId of secondaries) {
      if (!targetableGoalIds.has(goalId)) {
        return rejected("unowned_goal_reference");
      }
    }
    // A goal named twice on one session is not two kinds of attention; it is a
    // response that did not mean what it appears to say.
    if (
      new Set([session.session.primaryGoalId, ...secondaries]).size !==
      secondaries.length + 1
    ) {
      return rejected("business_rule");
    }

    // A handle the owner never issued is a session they did not offer, and
    // one named twice would delete one session for two. Either refuses the
    // whole answer, as an invented goal id does.
    const replaces = session.session.replaces;
    if (replaces !== undefined) {
      if (!replaceHandles.has(replaces) || replaced.has(replaces)) {
        return rejected("business_rule");
      }
      replaced.add(replaces);
    }

    const count = (perDay.get(session.session.date) ?? 0) + 1;
    if (count > MAX_SESSIONS_PER_DAY) return rejected("business_rule");
    perDay.set(session.session.date, count);

    sessions.push(session.session);
  }

  const assumptions = validateStringArray(
    parsed.assumptions,
    MAX_PLAN_ASSUMPTIONS,
    200,
  );
  if (assumptions === null) return rejected("business_rule");

  const uncertainties = validateUncertainties(
    parsed.uncertainties,
    MAX_PLAN_UNCERTAINTIES,
  );
  if (uncertainties === null) return rejected("business_rule");

  const safetyConsiderations = validateStringArray(
    parsed.safetyConsiderations,
    MAX_PLAN_SAFETY_CONSIDERATIONS,
    240,
  );
  if (safetyConsiderations === null) return rejected("business_rule");

  // A present flag never blocks generation, but it does constrain the output.
  // Without at least one bounded safety consideration the proposal has not
  // acknowledged what the owner reported.
  if (context.hasSafetySignal && safetyConsiderations.length === 0) {
    return rejected("safety_requirement");
  }

  const proposal: SevenDayPlanProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    weekDescription,
    startDate: context.horizonStartDate,
    endDate: context.horizonEndDate,
    sessions,
    ...(assumptions.length > 0 ? { assumptions } : {}),
    ...(uncertainties.length > 0 ? { uncertainties } : {}),
    ...(safetyConsiderations.length > 0 ? { safetyConsiderations } : {}),
  };

  if (byteLength(JSON.stringify(proposal)) > PLAN_CONTENT_MAX_BYTES) {
    return rejected("too_large");
  }

  return { outcome: "accepted", proposal };
}

type PlanSessionResult =
  | { outcome: "accepted"; session: SevenDayPlanSession }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/**
 * One session, session-level only.
 *
 * The field allowlist is the enforcement of two separate decisions at once.
 * There is no `activities`, `measurementMode`, or `target` key, because detail
 * is M3-03D and a session that carried one here would be a target M3-04 could
 * not store. And there is no `weight`, `share`, or `percentage` key anywhere,
 * because decision 6 rejected weighted allocation outright — a rejected field
 * that the allowlist happens to exclude is a rule nobody has to remember.
 */
function validatePlanSession(
  entry: unknown,
  bounds: { startMs: number; endMs: number },
): PlanSessionResult {
  if (!isRecord(entry)) return rejected("schema");
  if (
    findUnknownField(entry, [
      "date",
      "title",
      "sport",
      "focus",
      "intent",
      "durationMinutes",
      "primaryGoalId",
      "secondaryGoalIds",
      "alternatives",
      "rationale",
      "replaces",
    ])
  ) {
    return rejected("unknown_field");
  }

  // Null is how the strict grammar says "replaces nothing".
  if (
    entry.replaces !== undefined &&
    entry.replaces !== null &&
    (typeof entry.replaces !== "string" ||
      !/^r[1-9][0-9]?$/.test(entry.replaces))
  ) {
    return rejected("schema");
  }

  const title = readText(entry.title, 120);
  const sport = readText(entry.sport, 60);
  const focus = readText(entry.focus, 300);
  const intent = readText(entry.intent, 300);
  const rationale = readText(entry.rationale, 300);
  if (
    title === null ||
    sport === null ||
    focus === null ||
    intent === null ||
    rationale === null ||
    typeof entry.primaryGoalId !== "string" ||
    entry.primaryGoalId.length === 0
  ) {
    return rejected("schema");
  }

  const dateMs = parseIsoDate(entry.date);
  if (dateMs === null) return rejected("impossible_date");
  if (dateMs < bounds.startMs || dateMs > bounds.endMs) {
    return rejected("impossible_date");
  }

  if (
    typeof entry.durationMinutes !== "number" ||
    !Number.isSafeInteger(entry.durationMinutes) ||
    entry.durationMinutes <= 0
  ) {
    return rejected("invalid_duration");
  }

  const secondaryGoalIds = validateSecondaryGoalIds(entry.secondaryGoalIds);
  if (secondaryGoalIds === null) return rejected("schema");

  const alternatives = validatePlanAlternatives(entry.alternatives);
  if (alternatives === null) return rejected("business_rule");

  return {
    outcome: "accepted",
    session: {
      date: entry.date as string,
      title,
      sport,
      focus,
      intent,
      durationMinutes: entry.durationMinutes,
      primaryGoalId: entry.primaryGoalId,
      ...(secondaryGoalIds.length > 0 ? { secondaryGoalIds } : {}),
      ...(alternatives.length > 0 ? { alternatives } : {}),
      rationale,
      ...(typeof entry.replaces === "string"
        ? { replaces: entry.replaces }
        : {}),
    },
  };
}

/** Past six, the first six are kept. */
function validateSecondaryGoalIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.slice(0, MAX_SECONDARY_GOALS_PER_SESSION);
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) return null;
  return [...(ids as string[])];
}

/** Past two, the first two are kept, each cut to fit. */
function validatePlanAlternatives(
  value: unknown,
): SevenDayPlanAlternative[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const alternatives: SevenDayPlanAlternative[] = [];
  for (const entry of value.slice(0, MAX_ALTERNATIVES_PER_SESSION)) {
    if (!isRecord(entry)) return null;
    if (findUnknownField(entry, ["title", "whenToChoose"])) return null;
    const title = readText(entry.title, 120);
    const whenToChoose = readText(entry.whenToChoose, 200);
    if (title === null || whenToChoose === null) return null;
    alternatives.push({ title, whenToChoose });
  }
  return alternatives;
}

function collectRoadmapStrings(roadmap: RoadmapProposal): string[] {
  return [
    roadmap.title,
    roadmap.summary ?? "",
    ...roadmap.phases.flatMap((phase) => [
      phase.title,
      phase.focus,
      ...phase.milestones.flatMap((milestone) => [
        milestone.title,
        milestone.observableCriterion ?? "",
      ]),
    ]),
  ];
}

function collectPlanStrings(proposal: CoachAIProposal): string[] {
  if (!("sessions" in proposal)) return [];
  return [
    proposal.weekDescription,
    ...proposal.sessions.flatMap((session) => [
      session.title,
      session.sport,
      session.focus,
      session.intent,
      session.rationale,
      ...(session.alternatives ?? []).flatMap((alternative) => [
        alternative.title,
        alternative.whenToChoose,
      ]),
    ]),
    ...(proposal.assumptions ?? []),
    ...(proposal.uncertainties ?? []).flatMap((entry) => [
      entry.statement,
      entry.whyItMatters,
      entry.whatToWatch,
    ]),
    ...(proposal.safetyConsiderations ?? []),
  ];
}

function containsUnsafeContent(strings: string[]): boolean {
  return strings.some((value) =>
    UNSAFE_PATTERNS.some((pattern) => pattern.test(value)),
  );
}

/** Returns the first key outside the allowlist, so extra fields reject. */
function findUnknownField(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  return Object.keys(value).find((key) => !allowed.includes(key)) ?? null;
}

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  // Rejects a day that silently rolled over, such as 2026-04-31.
  return parsed.toISOString().slice(0, 10) === value ? time : null;
}

/**
 * Text the coach wrote, cut to fit rather than refused (owner, 17 Oct 2026).
 * A 241-character safety note threw away a whole paid plan; models count
 * characters badly, so the prompt states about 80% of each limit and this
 * catches what still runs over. `null` is refused: not a string, or empty.
 */
function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return fitText(withoutSemicolons(value), max);
}

/**
 * "; " becomes ". " and the next word starts with a capital (owner, 17 Oct
 * 2026): the prompt forbids semicolons and the model still writes them. Only
 * the coach's own words come through here, its memory candidates included;
 * the owner's own text never does.
 */
export function withoutSemicolons(value: string): string {
  return value.replace(
    /\s*;\s+(\S)/gu,
    (_match, next: string) => `. ${next.toLocaleUpperCase()}`,
  );
}

/** As `readText`, and more than whitespace: a blank rationale explains nothing. */
function readProse(value: unknown, max: number): string | null {
  const text = readText(value, max);
  return text !== null && text.trim().length > 0 ? text : null;
}

/** Absent, or text cut to fit. A null is not absent: JSON says so on purpose. */
function readOptionalText(
  value: unknown,
  max: number,
): string | undefined | null {
  return value === undefined ? undefined : readText(value, max);
}

/**
 * At most `max` UTF-16 units, so at most `max` characters for the database's
 * `char_length` too. A sentence end in the last fifth is where it stops, so
 * little is lost; otherwise the last whole word, marked with "…". A wider
 * window could drop half a safety note.
 */
export function fitText(value: string, max: number): string {
  if (value.length <= max) return value;

  // Nothing but whitespace stays whitespace, so the blank checks still bite.
  if (value.trim().length === 0) return value.slice(0, max);
  // Trailing spaces are not text worth a cut.
  if (value.trimEnd().length <= max) return value.trimEnd();

  const head = value.slice(0, max + 1);
  let sentenceEnd = -1;
  for (const match of head.matchAll(SENTENCE_END)) sentenceEnd = match.index;
  if (sentenceEnd + 1 >= max * 0.8) return value.slice(0, sentenceEnd + 1);

  const ellipsis = "…";
  let room = value.slice(0, max - ellipsis.length);
  // Never half a character: drop a high surrogate left without its pair.
  if (/[\uD800-\uDBFF]$/.test(room)) room = room.slice(0, -1);
  // A word that ends exactly where the room does is whole; keep it.
  const endsOnWord = /\s/.test(value.charAt(room.length));
  const lastSpace = room.search(/\s\S*$/);
  const cut =
    endsOnWord || lastSpace < max / 2 ? room : room.slice(0, lastSpace);
  return cut.trimEnd() + ellipsis;
}

/**
 * ".", "!" or "?" before a space, after a word of three letters or more or a
 * closing quote or bracket: "z. B.", "ca.", "e.g." and "9 km." are not ends.
 */
const SENTENCE_END =
  /(?<=(?:^|[^\p{L}.])\p{L}{3,}|[\p{L}\d][)"'”»])[.!?](?=\s)/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttentionLevel(value: unknown): value is RoadmapGoalAttentionLevel {
  return (
    typeof value === "string" &&
    (ROADMAP_GOAL_ATTENTION_LEVELS as readonly string[]).includes(value)
  );
}

function isMemoryType(value: unknown): value is MemoryType {
  return (
    typeof value === "string" &&
    (MEMORY_TYPES as readonly string[]).includes(value)
  );
}

function rejected(reason: CoachAIRejectionReason): {
  outcome: "rejected";
  reason: CoachAIRejectionReason;
} {
  return { outcome: "rejected", reason };
}
