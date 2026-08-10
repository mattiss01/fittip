import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  ROADMAP_GOAL_ATTENTION_LEVELS,
  type CoachAIContext,
  type CoachAIOperation,
  type CoachAIProposal,
  type RoadmapGoalAttention,
  type RoadmapGoalAttentionLevel,
  type RoadmapMemoryCandidate,
  type RoadmapMilestone,
  type RoadmapPhase,
  type RoadmapProposal,
  type RoadmapResponse,
  type RoadmapReviewPoint,
  type RoadmapUncertainty,
  type SevenDayPlanProposal,
  type SevenDayPlanSession,
} from "@/server/ai/contracts";
import { byteLength } from "@/server/ai/context";
import {
  MEMORY_EXCERPT_MAX_LENGTH,
  normalizeOwnerText,
} from "@/server/ai/owner-text";
import { MEMORY_TYPES, type MemoryType } from "@/server/memory/memory-records";

/**
 * Output validation. Provider output is untrusted text: it is size-bounded
 * before parsing, parsed only as strict JSON, and accepted only if every field
 * matches the operation schema exactly. Partial validity is not partial
 * acceptance — one bad field rejects the whole candidate, and a rejected
 * candidate creates no proposal and writes nothing.
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

export const COACH_AI_MAX_OUTPUT_BYTES = 16_000;

/** Decision 2's bounds. Serialized roadmap content is capped separately. */
export const ROADMAP_CONTENT_MAX_BYTES = 16_000;
const MAX_PHASES = 6;
const MIN_PHASES = 1;
const MAX_MILESTONES_PER_PHASE = 3;
const MAX_ATTENTION_PER_PHASE = 4;
const MAX_ASSUMPTIONS = 4;
const MAX_UNCERTAINTIES = 4;
const MAX_REVIEW_POINTS = 4;
const MAX_SAFETY_CONSIDERATIONS = 3;
const MAX_MEMORY_CANDIDATES = 4;

const MAX_SESSIONS = 14;
const MAX_SESSIONS_PER_DAY = 2;
const PLAN_DAYS = 7;
const MIN_SESSION_MINUTES = 10;
const MAX_SESSION_MINUTES = 240;
const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (input.operation === "create_roadmap") {
    const result = validateRoadmapCandidate(input);
    return result.outcome === "accepted"
      ? { outcome: "accepted", proposal: result.response.roadmap }
      : result;
  }

  const maxBytes = input.maxBytes ?? COACH_AI_MAX_OUTPUT_BYTES;
  if (byteLength(input.body) > maxBytes) return rejected("too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return rejected("unparsable");
  }
  if (!isRecord(parsed)) return rejected("schema");

  const targetableGoalIds = new Set(
    input.context.targetableGoals.map((goal) => goal.id),
  );
  const result = validateSevenDayPlan(parsed, input.context, targetableGoalIds);
  if (result.outcome === "rejected") return result;

  return containsUnsafeContent(collectPlanStrings(result.proposal))
    ? rejected("unsafe_content")
    : result;
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

  // Decision 7: a present flag never blocks generation, but it does constrain
  // the output. Without at least one bounded safety consideration the proposal
  // has not acknowledged what the owner reported.
  if (input.context.hasSafetySignal) {
    if (
      !roadmap.safetyConsiderations ||
      roadmap.safetyConsiderations.length === 0
    ) {
      return rejected("safety_requirement");
    }
  }

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
      "assumptions",
      "uncertainties",
      "reviewPoints",
      "safetyConsiderations",
    ])
  ) {
    return rejected("unknown_field");
  }

  if (
    value.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_roadmap ||
    !isBounded(value.title, 1, 80) ||
    !isBounded(value.summary, 1, 600) ||
    !Array.isArray(value.phases) ||
    !Array.isArray(value.reviewPoints)
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
  const coreGoalIds = context.targetableGoals
    .filter((goal) => goal.priorityTier === "core")
    .map((goal) => goal.id);
  const attendedGoalIds = new Set<string>();

  const phases: RoadmapPhase[] = [];
  let expectedStartMs = horizonStartMs;

  for (const entry of value.phases) {
    const phase = validatePhase(entry, {
      targetableGoalIds,
      horizonEndMs,
      expectedStartMs,
    });
    if (phase.outcome === "rejected") return phase;

    for (const attention of phase.phase.goalAttention) {
      attendedGoalIds.add(attention.goalId);
    }
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

  // Decision 2: every active core goal appears in at least one phase. A core
  // goal the roadmap never mentions is a roadmap that quietly dropped it.
  if (!coreGoalIds.every((id) => attendedGoalIds.has(id))) {
    return rejected("business_rule");
  }

  const assumptions = validateStringArray(
    value.assumptions,
    MAX_ASSUMPTIONS,
    200,
  );
  if (assumptions === null) return rejected("business_rule");

  const uncertainties = validateUncertainties(value.uncertainties);
  if (uncertainties === null) return rejected("business_rule");

  const reviewPoints = validateReviewPoints(value.reviewPoints, horizonEndMs);
  if (reviewPoints === null) return rejected("business_rule");

  const safetyConsiderations = validateStringArray(
    value.safetyConsiderations,
    MAX_SAFETY_CONSIDERATIONS,
    240,
  );
  if (safetyConsiderations === null) return rejected("business_rule");

  const roadmap: RoadmapProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_roadmap,
    title: value.title,
    summary: value.summary,
    startDate: value.startDate,
    endDate: value.endDate,
    phases,
    ...(assumptions.length > 0 ? { assumptions } : {}),
    ...(uncertainties.length > 0 ? { uncertainties } : {}),
    reviewPoints,
    ...(safetyConsiderations.length > 0 ? { safetyConsiderations } : {}),
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
  if (
    !isBounded(entry.title, 1, 80) ||
    !isBounded(entry.focus, 1, 300) ||
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

  if (
    entry.goalAttention.length < 1 ||
    entry.goalAttention.length > MAX_ATTENTION_PER_PHASE ||
    entry.milestones.length < 1 ||
    entry.milestones.length > MAX_MILESTONES_PER_PHASE
  ) {
    return rejected("business_rule");
  }

  const goalAttention: RoadmapGoalAttention[] = [];
  const seenGoalIds = new Set<string>();
  for (const attention of entry.goalAttention) {
    if (!isRecord(attention)) return rejected("schema");
    if (findUnknownField(attention, ["goalId", "level", "reason"])) {
      return rejected("unknown_field");
    }
    if (
      typeof attention.goalId !== "string" ||
      !isBounded(attention.reason, 1, 160) ||
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
      reason: attention.reason,
    });
  }

  const milestones: RoadmapMilestone[] = [];
  for (const milestone of entry.milestones) {
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
    if (
      !isBounded(milestone.title, 1, 80) ||
      !isBounded(milestone.observableCriterion, 1, 200) ||
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

    if (
      milestone.goalIds.length < 1 ||
      milestone.goalIds.length > MAX_ATTENTION_PER_PHASE
    ) {
      return rejected("business_rule");
    }
    for (const goalId of milestone.goalIds) {
      if (typeof goalId !== "string") return rejected("schema");
      if (!bounds.targetableGoalIds.has(goalId)) {
        return rejected("unowned_goal_reference");
      }
    }

    milestones.push({
      title: milestone.title,
      observableCriterion: milestone.observableCriterion,
      targetDate: milestone.targetDate as string,
      goalIds: [...(milestone.goalIds as string[])],
    });
  }

  return {
    outcome: "accepted",
    phase: {
      title: entry.title,
      focus: entry.focus,
      startDate: entry.startDate as string,
      endDate: entry.endDate as string,
      goalAttention,
      milestones,
    },
  };
}

/** Returns `null` on any failure, so the caller rejects the whole candidate. */
function validateStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (!value.every((entry) => isBounded(entry, 1, maxLength))) return null;
  return [...(value as string[])];
}

function validateUncertainties(value: unknown): RoadmapUncertainty[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_UNCERTAINTIES) return null;

  const uncertainties: RoadmapUncertainty[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (findUnknownField(entry, ["statement", "whyItMatters", "whatToWatch"])) {
      return null;
    }
    if (
      !isBounded(entry.statement, 1, 200) ||
      !isBounded(entry.whyItMatters, 1, 200) ||
      !isBounded(entry.whatToWatch, 1, 200)
    ) {
      return null;
    }
    uncertainties.push({
      statement: entry.statement,
      whyItMatters: entry.whyItMatters,
      whatToWatch: entry.whatToWatch,
    });
  }
  return uncertainties;
}

function validateReviewPoints(
  value: unknown,
  horizonEndMs: number,
): RoadmapReviewPoint[] | null {
  if (!Array.isArray(value) || value.length < 1) return null;
  if (value.length > MAX_REVIEW_POINTS) return null;

  const reviewPoints: RoadmapReviewPoint[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (
      findUnknownField(entry, [
        "title",
        "triggerDate",
        "triggerCondition",
        "question",
      ])
    ) {
      return null;
    }
    if (!isBounded(entry.title, 1, 200) || !isBounded(entry.question, 1, 200)) {
      return null;
    }

    const hasDate =
      entry.triggerDate !== undefined && entry.triggerDate !== null;
    const hasCondition =
      entry.triggerCondition !== undefined && entry.triggerCondition !== null;
    // Decision 3: a review point says either "Review on _date_" or "Review when
    // _condition_". Both at once has no display, and neither has no meaning.
    if (hasDate === hasCondition) return null;

    if (hasDate) {
      const triggerMs = parseIsoDate(entry.triggerDate);
      if (triggerMs === null || triggerMs > horizonEndMs) return null;
      reviewPoints.push({
        title: entry.title,
        triggerDate: entry.triggerDate as string,
        question: entry.question,
      });
    } else {
      if (!isBounded(entry.triggerCondition, 1, 200)) return null;
      reviewPoints.push({
        title: entry.title,
        triggerCondition: entry.triggerCondition,
        question: entry.question,
      });
    }
  }
  return reviewPoints;
}

type MemorySectionResult =
  | { outcome: "accepted"; candidates: RoadmapMemoryCandidate[] }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

/**
 * Decision 4b and ADR-015 function 3.
 *
 * A candidate carries no model-authored text. It names a memory type and an
 * exact excerpt of the planning note, and that excerpt becomes the proposed
 * memory content. The substring check is what makes "feedback never becomes
 * memory" mechanical rather than a rule someone has to remember: the feedback
 * is simply not part of the string being searched.
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
  if (value.length > MAX_MEMORY_CANDIDATES) return rejected("business_rule");

  // With no planning note there is nothing a candidate could legitimately cite.
  if (planningNote === null) return rejected("business_rule");
  const normalizedNote = normalizeOwnerText(planningNote);

  const candidates: RoadmapMemoryCandidate[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return rejected("schema");
    if (
      findUnknownField(entry, ["memoryType", "sourceExcerpt", "confidence"])
    ) {
      return rejected("unknown_field");
    }
    if (!isMemoryType(entry.memoryType)) return rejected("schema");
    if (typeof entry.sourceExcerpt !== "string") return rejected("schema");

    const excerpt = normalizeOwnerText(entry.sourceExcerpt);
    if (excerpt.length < 1 || excerpt.length > MEMORY_EXCERPT_MAX_LENGTH) {
      return rejected("business_rule");
    }
    if (!normalizedNote.includes(excerpt)) {
      return rejected("business_rule");
    }

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
      sourceExcerpt: excerpt,
      ...(confidence === undefined ? {} : { confidence }),
    });
  }

  return { outcome: "accepted", candidates };
}

function validateSevenDayPlan(
  parsed: Record<string, unknown>,
  context: CoachAIContext,
  targetableGoalIds: Set<string>,
): CoachAIValidationResult {
  if (findUnknownField(parsed, ["schemaVersion", "startDate", "sessions"])) {
    return rejected("unknown_field");
  }

  if (
    parsed.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan ||
    !Array.isArray(parsed.sessions)
  ) {
    return rejected("schema");
  }

  const startMs = parseIsoDate(parsed.startDate);
  const todayMs = Date.parse(`${context.today}T00:00:00.000Z`);
  if (startMs === null) return rejected("impossible_date");
  if (startMs < todayMs || startMs > todayMs + PLAN_DAYS * DAY_MS) {
    return rejected("impossible_date");
  }

  if (parsed.sessions.length < 1 || parsed.sessions.length > MAX_SESSIONS) {
    return rejected("business_rule");
  }

  const sessions: SevenDayPlanSession[] = [];
  const perDay = new Map<string, number>();

  for (const entry of parsed.sessions) {
    if (!isRecord(entry)) return rejected("schema");
    if (
      findUnknownField(entry, [
        "date",
        "title",
        "intent",
        "durationMinutes",
        "goalId",
      ])
    ) {
      return rejected("unknown_field");
    }
    if (
      !isBounded(entry.title, 1, 120) ||
      !isBounded(entry.intent, 1, 300) ||
      typeof entry.goalId !== "string"
    ) {
      return rejected("schema");
    }

    const dateMs = parseIsoDate(entry.date);
    if (dateMs === null) return rejected("impossible_date");
    if (dateMs < startMs || dateMs >= startMs + PLAN_DAYS * DAY_MS) {
      return rejected("impossible_date");
    }

    if (
      typeof entry.durationMinutes !== "number" ||
      !Number.isSafeInteger(entry.durationMinutes) ||
      entry.durationMinutes < MIN_SESSION_MINUTES ||
      entry.durationMinutes > MAX_SESSION_MINUTES
    ) {
      return rejected("invalid_duration");
    }

    if (!targetableGoalIds.has(entry.goalId)) {
      return rejected("unowned_goal_reference");
    }

    const date = entry.date as string;
    const count = (perDay.get(date) ?? 0) + 1;
    if (count > MAX_SESSIONS_PER_DAY) return rejected("business_rule");
    perDay.set(date, count);

    sessions.push({
      date,
      title: entry.title,
      intent: entry.intent,
      durationMinutes: entry.durationMinutes,
      goalId: entry.goalId,
    });
  }

  const proposal: SevenDayPlanProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    startDate: parsed.startDate as string,
    sessions,
  };
  return { outcome: "accepted", proposal };
}

function collectRoadmapStrings(roadmap: RoadmapProposal): string[] {
  return [
    roadmap.title,
    roadmap.summary,
    ...roadmap.phases.flatMap((phase) => [
      phase.title,
      phase.focus,
      ...phase.goalAttention.map((attention) => attention.reason),
      ...phase.milestones.flatMap((milestone) => [
        milestone.title,
        milestone.observableCriterion,
      ]),
    ]),
    ...(roadmap.assumptions ?? []),
    ...(roadmap.uncertainties ?? []).flatMap((entry) => [
      entry.statement,
      entry.whyItMatters,
      entry.whatToWatch,
    ]),
    ...roadmap.reviewPoints.flatMap((entry) => [
      entry.title,
      entry.question,
      entry.triggerCondition ?? "",
    ]),
    ...(roadmap.safetyConsiderations ?? []),
  ];
}

function collectPlanStrings(proposal: CoachAIProposal): string[] {
  return "sessions" in proposal
    ? proposal.sessions.flatMap((session) => [session.title, session.intent])
    : [];
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

function isBounded(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}

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
