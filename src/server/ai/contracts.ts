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
  create_roadmap: "fittip.roadmap.v1",
  create_seven_day_plan: "fittip.seven-day-plan.v1",
} as const satisfies Record<CoachAIOperation, string>;

/**
 * Prompt identifiers only. M3-01 ships no prompt text; a provider adapter and
 * its prompts are M3-01B.
 */
export const COACH_AI_PROMPT_VERSIONS = {
  create_roadmap: "roadmap-stub-v1",
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
 * Targetable and historical goals stay separate fields all the way to the
 * adapter, so a prompt cannot quietly treat an achieved goal as an objective.
 */
export type CoachAIContext = {
  today: string;
  targetableGoals: CoachAIGoalReference[];
  historicalGoals: CoachAIGoalReference[];
  memory: CoachAIMemoryReference[];
};

/**
 * Everything an adapter is given. Every field is server-derived: no raw Auth
 * token, email, header, caller metadata, or database row appears here.
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

export type RoadmapPhase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  goalId: string;
};

export type RoadmapProposal = {
  schemaVersion: typeof COACH_AI_SCHEMA_VERSIONS.create_roadmap;
  summary: string;
  phases: RoadmapPhase[];
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
