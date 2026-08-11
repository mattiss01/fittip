import "server-only";

import type { GoalTier } from "@/server/goals/goal-records";
import type { MemoryType } from "@/server/memory/memory-records";

/**
 * The provider-neutral coaching boundary.
 *
 * Nothing in this module knows a provider, reads a credential, or opens a
 * socket. An adapter receives an already-authorized, operation-specific payload
 * and returns an untrusted candidate. The domain service owns authentication,
 * context selection, limits, validation, and the decision that the result stays
 * a proposal.
 */

export const COACH_AI_OPERATIONS = [
  "create_roadmap",
  "create_seven_day_plan",
] as const;

export type CoachAIOperation = (typeof COACH_AI_OPERATIONS)[number];

/** Bumped whenever an accepted request or response shape changes. */
export const COACH_AI_SCHEMA_VERSIONS = {
  create_roadmap: "fittip.roadmap.v2",
  create_seven_day_plan: "fittip.seven-day-plan.v1",
} as const satisfies Record<CoachAIOperation, string>;

/**
 * Prompt identifiers. `create_roadmap` carries the real M3-02 prompt; the
 * seven-day-plan entry is still the M3-01 stub, and M3-03 owns replacing it.
 */
export const COACH_AI_PROMPT_VERSIONS = {
  create_roadmap: "roadmap-v2-2026-08-10",
  create_seven_day_plan: "seven-day-plan-stub-v1",
} as const satisfies Record<CoachAIOperation, string>;

/** The two runtimes ADR-006 and M0-06A permit. Nothing else may ever call out. */
export type CoachAIEnvironment = "local" | "founder-staging";

export function isCoachAIOperation(value: unknown): value is CoachAIOperation {
  return (
    typeof value === "string" &&
    (COACH_AI_OPERATIONS as readonly string[]).includes(value)
  );
}

/**
 * The exact goal fields allowed to leave this system. Adding one is a privacy
 * decision, not a convenience.
 */
export type CoachAIGoalReference = {
  id: string;
  title: string;
  category: string;
  priorityTier: GoalTier;
  targetDate: string | null;
};

/** The exact memory fields allowed to leave this system. */
export type CoachAIMemoryReference = {
  id: string;
  memoryType: MemoryType;
  content: string;
};

/**
 * One completed session, exactly as ADR-013 decision 4 enumerates it. Anything
 * not listed here is invisible to a coach until that ADR is amended, which is
 * why the fields are copied one at a time rather than spread from a row.
 */
export type CoachAICompletionReference = {
  localDate: string;
  status: string;
  title: string | null;
  sport: string | null;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: string | null;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
  /** Truncated before it leaves the boundary. See ADR-013 decision 4. */
  note: string | null;
  replacementDescription: string | null;
  correctionReason: string | null;
  activityNames: string[];
};

/** A planned session that produced no completion (ADR-013 decision 6). */
export type CoachAIMissedSessionReference = {
  localDate: string;
  title: string;
  sport: string;
};

/** Planned future state under ADR-013 decision 5, with its lock state. */
export type CoachAIPlanCommitmentReference = {
  localDate: string;
  title: string;
  sport: string;
  isLocked: boolean;
};

/**
 * What the coach is told about the reductions ADR-013 approves. A trimmed
 * window that reads as a complete one is the specific failure decision 1
 * names, so the counts travel alongside the sessions.
 */
export type CoachAITrainingHistory = {
  windowStartDate: string;
  windowEndDate: string;
  sessionsInWindow: number;
  sessionsIncluded: number;
  completions: CoachAICompletionReference[];
  missedPlannedSessions: CoachAIMissedSessionReference[];
};

/**
 * The immediately previous proposal, in reduced form, on a regeneration only.
 * ADR-014 decision 2a: only this one travels, never the chain, so context size
 * stays flat however many rounds the owner goes.
 */
export type CoachAIPreviousProposalReference = {
  title: string;
  summary: string;
  phases: {
    title: string;
    focus: string;
    startDate: string;
    endDate: string;
  }[];
};

/**
 * Targetable and historical goals stay separate fields all the way to the
 * adapter, so a prompt cannot quietly treat an achieved goal as an objective.
 *
 * `planningNote` and `regenerationFeedback` are the first owner-authored
 * fields to cross this boundary (ADR-014). They inform what the coach
 * proposes; they have no authority over what the server accepts, because every
 * property they might try to change is revalidated after the response returns
 * against values the server derived and the model never saw.
 */
export type CoachAIContext = {
  today: string;
  horizonStartDate: string;
  horizonEndDate: string;
  targetableGoals: CoachAIGoalReference[];
  historicalGoals: CoachAIGoalReference[];
  /**
   * The ids of active goals whose target date falls outside the horizon. Ids
   * rather than whole goals: every one of them is already in `targetableGoals`,
   * and duplicating a dozen goal objects would spend a sixth of the context
   * budget restating what the coach can already read.
   */
  goalsOutsideHorizon: string[];
  memory: CoachAIMemoryReference[];
  trainingHistory: CoachAITrainingHistory;
  planCommitments: CoachAIPlanCommitmentReference[];
  /** True when any eligible completion carries one of the four safety flags. */
  hasSafetySignal: boolean;
  planningNote: string | null;
  regenerationFeedback: string | null;
  previousProposal: CoachAIPreviousProposalReference | null;
};

/**
 * Everything an adapter is given. Every field except the two owner-authored
 * text fields inside `context` is server-derived: no raw Auth token, email,
 * header, caller metadata, or database row appears here. ADR-014 corrected the
 * older claim that *every* field was server-derived; the note and the feedback
 * are the deliberate exceptions, and they are the reason the output validator
 * is the control rather than a filter over the text.
 */
export type CoachAIRequest = {
  requestId: string;
  ownerId: string;
  operation: CoachAIOperation;
  schemaVersion: string;
  promptVersion: string;
  environment: CoachAIEnvironment;
  requestedAt: string;
  idempotencyKey: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  deadlineMs: number;
  context: CoachAIContext;
};

/**
 * What an adapter returns: an untrusted body, never a parsed object. Parsing
 * before the size gate would be the first thing an oversized response abused.
 * Token counts are `null` when the provider reports none — unknown, never zero.
 */
export type CoachAICandidate = {
  body: string;
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
};

export interface CoachAI {
  /**
   * `provider` adapters must pass the live enablement gate before invocation.
   * `fixture` adapters are pure functions over an authored corpus.
   */
  readonly kind: "fixture" | "provider";
  readonly providerCode: string;
  readonly modelCode: string;
  createRoadmap(request: CoachAIRequest): Promise<CoachAICandidate>;
  createSevenDayPlan(request: CoachAIRequest): Promise<CoachAICandidate>;
}

/**
 * `fittip.roadmap.v2`.
 *
 * Attention is ordinal rather than a percentage, because a model-generated
 * "60% / 40%" looks measurable while the roadmap contains no training volume
 * from which to calculate it. `deferred` describes this roadmap only; it never
 * changes a goal's lifecycle or tier.
 */
export const ROADMAP_GOAL_ATTENTION_LEVELS = [
  "primary",
  "secondary",
  "maintenance",
  "deferred",
] as const;

export type RoadmapGoalAttentionLevel =
  (typeof ROADMAP_GOAL_ATTENTION_LEVELS)[number];

export type RoadmapGoalAttention = {
  goalId: string;
  level: RoadmapGoalAttentionLevel;
  reason: string;
};

export type RoadmapMilestone = {
  title: string;
  /** Observable without promising an outcome. The UI says "Aim for by". */
  observableCriterion: string;
  targetDate: string;
  goalIds: string[];
};

export type RoadmapPhase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  goalAttention: RoadmapGoalAttention[];
  milestones: RoadmapMilestone[];
};

export type RoadmapUncertainty = {
  statement: string;
  whyItMatters: string;
  whatToWatch: string;
};

/**
 * Either a date or a condition, never both. A review point states when the
 * direction should be reconsidered; it never replans, notifies, or mutates.
 */
export type RoadmapReviewPoint = {
  title: string;
  triggerDate?: string;
  triggerCondition?: string;
  question: string;
};

export type RoadmapProposal = {
  schemaVersion: typeof COACH_AI_SCHEMA_VERSIONS.create_roadmap;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  phases: RoadmapPhase[];
  assumptions?: string[];
  uncertainties?: RoadmapUncertainty[];
  reviewPoints: RoadmapReviewPoint[];
  /**
   * May explain conservative direction. It may not diagnose, prescribe
   * treatment, or claim safety; the stop/professional-help copy is
   * server-owned and never model-authored.
   */
  safetyConsiderations?: string[];
};

/**
 * A memory candidate extracted from the planning note.
 *
 * It carries no model-authored text: `sourceExcerpt` must be an exact
 * normalized substring of the planning note, and that excerpt becomes the
 * proposed memory content. Text present only in regeneration feedback
 * therefore cannot become memory.
 */
export type RoadmapMemoryCandidate = {
  memoryType: MemoryType;
  sourceExcerpt: string;
  confidence?: number;
};

/**
 * Where a proposal's provenance comes from.
 *
 * Ids and revisions only, never copied content. Acceptance rechecks every one
 * of these against its current state, so a proposal built on a goal the owner
 * has since abandoned produces a visible conflict rather than a silent
 * acceptance.
 */
export type CoachAISourceReference = {
  kind: "goal" | "memory" | "plan_version" | "completion";
  recordId: string;
  revisionId?: string;
  revisionNumber?: number;
};

/**
 * The two sections of a roadmap response. They validate independently: an
 * invalid memory section is discarded and the roadmap still returns.
 */
export type RoadmapResponse = {
  roadmap: RoadmapProposal;
  memoryCandidates: RoadmapMemoryCandidate[];
};

export type SevenDayPlanSession = {
  date: string;
  title: string;
  intent: string;
  durationMinutes: number;
  goalId: string;
};

export type SevenDayPlanProposal = {
  schemaVersion: typeof COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan;
  startDate: string;
  sessions: SevenDayPlanSession[];
};

/**
 * A validated candidate. It is still a proposal: no adapter and nothing in this
 * module may persist a goal, memory item, roadmap, plan, activity, or
 * completion.
 */
export type CoachAIProposal = RoadmapProposal | SevenDayPlanProposal;
