import "server-only";

import {
  selectActiveGoalContext,
  type GoalContextCandidate,
  type GoalTier,
} from "@/server/goals/goal-records";
import {
  selectActiveMemoryContext,
  type MemoryItemView,
} from "@/server/memory/memory-records";
import type {
  CoachAIContext,
  CoachAIGoalReference,
  CoachAIMemoryReference,
  CoachAIOperation,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";

/**
 * Context assembly: the one place that decides which owner records become
 * provider input. Eligibility comes from the two accepted server gates
 * (`selectActiveGoalContext` for goals, `selectActiveMemoryContext` for memory);
 * this module adds the field allowlist, the reference ceilings, and the
 * serialized size ceiling, and fails closed on anything it cannot vouch for.
 */

export type CoachAIContextLimits = {
  maxTargetableGoals: number;
  maxHistoricalGoals: number;
  maxMemoryItems: number;
  maxSerializedBytes: number;
};

export const COACH_AI_CONTEXT_LIMITS = {
  create_roadmap: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 10,
    maxMemoryItems: 40,
    maxSerializedBytes: 12_000,
  },
  create_seven_day_plan: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 5,
    maxMemoryItems: 40,
    maxSerializedBytes: 10_000,
  },
} as const satisfies Record<CoachAIOperation, CoachAIContextLimits>;

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 120;
const MAX_CATEGORY_LENGTH = 60;
const MAX_MEMORY_CONTENT_LENGTH = 1000;

/**
 * The goal fields context assembly needs, stated structurally so this module
 * never imports the repository. The repository's `Goal` satisfies it.
 */
export type CoachAIGoalRecord = GoalContextCandidate & {
  id: string;
  title: string;
  category: string;
  priorityTier: GoalTier;
  targetDate: string | null;
};

/**
 * One owner's records, already read through the owner-scoped repositories.
 * `ownerId` comes from the verified owner, never from a caller.
 */
export type CoachAIOwnedRecords = {
  ownerId: string;
  today: string;
  goalCollectionRevision: number;
  memoryCollectionRevision: number;
  goals: CoachAIGoalRecord[];
  memory: MemoryItemView[];
};

export type CoachAIAssembledContext = {
  context: CoachAIContext;
  serialized: string;
  serializedBytes: number;
  /**
   * Which owner-scoped records informed the request. Returned to the domain
   * caller so a proposal can record its provenance; deliberately absent from
   * telemetry, which carries counts only.
   */
  references: { goalIds: string[]; memoryIds: string[] };
};

export function buildCoachAIContext(
  operation: CoachAIOperation,
  records: CoachAIOwnedRecords,
  limits: CoachAIContextLimits = COACH_AI_CONTEXT_LIMITS[operation],
): CoachAIAssembledContext {
  if (!isIsoDate(records.today)) {
    throw new CoachAIError("context_invalid");
  }

  const goals = selectActiveGoalContext(records.goals);
  const memoryItems = selectActiveMemoryContext(records.memory, records.today);

  if (
    goals.targetable.length > limits.maxTargetableGoals ||
    goals.historical.length > limits.maxHistoricalGoals ||
    memoryItems.length > limits.maxMemoryItems
  ) {
    throw new CoachAIError("context_too_large");
  }

  const context: CoachAIContext = {
    today: records.today,
    targetableGoals: goals.targetable.map(toGoalReference),
    historicalGoals: goals.historical.map(toGoalReference),
    memory: memoryItems.map(toMemoryReference),
  };

  const serialized = JSON.stringify(context);
  const serializedBytes = byteLength(serialized);
  if (serializedBytes > limits.maxSerializedBytes) {
    throw new CoachAIError("context_too_large");
  }

  return {
    context,
    serialized,
    serializedBytes,
    references: {
      goalIds: [...context.targetableGoals, ...context.historicalGoals].map(
        (goal) => goal.id,
      ),
      memoryIds: context.memory.map((item) => item.id),
    },
  };
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Copies exactly the allowlisted fields. A column added to the repository's
 * `Goal` cannot ride along, because nothing here spreads the source record.
 */
function toGoalReference(goal: CoachAIGoalRecord): CoachAIGoalReference {
  if (
    !CANONICAL_UUID_PATTERN.test(goal.id) ||
    !isBounded(goal.title, MAX_TITLE_LENGTH) ||
    !isBounded(goal.category, MAX_CATEGORY_LENGTH) ||
    (goal.priorityTier !== "core" && goal.priorityTier !== "supporting") ||
    (goal.targetDate !== null && !isIsoDate(goal.targetDate))
  ) {
    throw new CoachAIError("context_invalid");
  }

  return {
    id: goal.id,
    title: goal.title,
    category: goal.category,
    priorityTier: goal.priorityTier,
    targetDate: goal.targetDate,
  };
}

function toMemoryReference(item: MemoryItemView): CoachAIMemoryReference {
  if (
    !CANONICAL_UUID_PATTERN.test(item.id) ||
    !isBounded(item.content, MAX_MEMORY_CONTENT_LENGTH)
  ) {
    throw new CoachAIError("context_invalid");
  }

  return {
    id: item.id,
    memoryType: item.memoryType,
    content: item.content,
  };
}

function isBounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  // A well-formed but impossible day (2026-02-30) parses to Invalid Date, and a
  // rolled-over day (2026-04-31) round-trips to a different date.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
