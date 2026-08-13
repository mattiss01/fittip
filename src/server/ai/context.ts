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
  CoachAIPreviousProposalReference,
  CoachAISourceReference,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import {
  PLANNING_NOTE_MAX_LENGTH,
  REGENERATION_FEEDBACK_MAX_LENGTH,
} from "@/server/ai/owner-text";
import {
  selectTrainingHistoryContext,
  type TrainingHistoryRecords,
} from "@/server/training/training-history-context";

/**
 * Context assembly: the one place that decides which owner records become
 * provider input.
 *
 * Eligibility comes from the accepted server gates — `selectActiveGoalContext`
 * for goals (ADR-012), `selectActiveMemoryContext` for memory (M2-02), and
 * `selectTrainingHistoryContext` for training history (ADR-013). This module
 * adds the field allowlist, the per-source ceilings, and the whole-context
 * ceiling, and fails closed on anything it cannot vouch for.
 *
 * ## Why the budget is per source
 *
 * ADR-014's closing finding: the old shape allowed 40 memory items at
 * `MEMORY_CONTENT_MAX_LENGTH` 1000 against a single 12,000-byte total. Forty
 * maximal items is 40,000 bytes — more than three times the ceiling the code
 * enforced — and assembly *denied* rather than reducing, so an owner who
 * curated a large memory could not generate at all and the error did not say
 * which source was at fault. Both halves of that are fixed here: every source
 * carries its own allocation, and a refusal names the source.
 *
 * ## What each behaviour on overflow is, and where it was approved
 *
 * - Goals, memory, and the previous proposal **deny**, naming the source.
 *   M3-02 decision 4a: "When any source exceeds its approved byte allocation,
 *   generation is unavailable with that source named; nothing is silently
 *   truncated beyond ADR-013's already approved per-field truncation."
 * - Training history and plan commitments are **trimmed by count and
 *   disclosed**, which ADR-013 decisions 1, 5 and 7 approve as a bounded
 *   reduction rather than a denial.
 * - The planning note and the feedback are **rejected at compose**, per
 *   ADR-014 decision 3, before they ever reach this module.
 */

export type CoachAIContextSourceName =
  | "targetable_goals"
  | "historical_goals"
  | "memory"
  | "training_history"
  | "plan_commitments"
  | "planning_note"
  | "regeneration_feedback"
  | "previous_proposal"
  | "whole_context";

/**
 * A refusal that can say which source was too large.
 *
 * It keeps `context_too_large` as its code, so a caller that maps codes to
 * screens is unaffected, and adds the source for the compose screen, which
 * decision 4a requires to name it.
 */
export class CoachAIContextTooLargeError extends CoachAIError {
  constructor(readonly source: CoachAIContextSourceName) {
    super("context_too_large");
    this.name = "CoachAIContextTooLargeError";
  }
}

/**
 * What a plan cannot be generated without (M3-03 decision 5).
 *
 * Deliberately short. Training history, accepted memory, a roadmap and a
 * planning note are all optional — an owner with one goal and nothing else must
 * be able to plan their first week, which is the case a threshold set any
 * higher would block.
 */
export const PLAN_CONTEXT_REQUIREMENTS = [
  "active_goal",
  "resolved_timezone",
] as const;

export type PlanContextRequirement = (typeof PLAN_CONTEXT_REQUIREMENTS)[number];

/**
 * The refusal below the context minimum.
 *
 * It carries what is missing so the compose screen can name it, and it is
 * thrown from context assembly on purpose: assembly runs before the idempotency
 * key is claimed and before any reservation is taken, so a refusal here spends
 * nothing and consumes no key. Moving this check later would quietly make the
 * cheapest possible refusal the most expensive one.
 */
export class CoachAIContextBelowMinimumError extends CoachAIError {
  constructor(readonly missing: readonly PlanContextRequirement[]) {
    super("context_below_minimum");
    this.name = "CoachAIContextBelowMinimumError";
  }
}

export type CoachAIContextLimits = {
  maxTargetableGoals: number;
  maxHistoricalGoals: number;
  maxMemoryItems: number;
  maxTrainingSessions: number;
  maxPlanCommitments: number;
  /** Per-source ceilings on the serialized bytes of that source alone. */
  bytes: {
    targetableGoals: number;
    historicalGoals: number;
    memory: number;
    /**
     * The whole `trainingHistory` object: the completion list, the missed-session
     * list, and the window envelope that carries the disclosure counts.
     */
    trainingHistory: number;
    /**
     * The share of `trainingHistory` the completion list alone may occupy.
     * Sessions are added newest-first until this binds, which is the trim
     * ADR-013 decisions 1 and 7 approve. The remainder of `trainingHistory` is
     * reserved for the miss list and the envelope, neither of which trims by
     * bytes, so neither may be allowed to push the source into a denial.
     */
    trainingHistoryCompletions: number;
    planCommitments: number;
    planningNote: number;
    regenerationFeedback: number;
    previousProposal: number;
    /** The sum of the parts plus the envelope. Never smaller than the sum. */
    total: number;
  };
};

/**
 * The approved per-source allocation for `create_roadmap`, derived on
 * 11 August 2026, re-derived on 12 August 2026 against a raised input ceiling,
 * and recorded with its arithmetic in the M3-02 validation record.
 *
 * The binding constraint is not ADR-013's "roughly 30,000 bytes". It is
 * `maxInputTokens` together with the adapter's refusal guard, which estimates
 * four characters per token over the **whole message set**. The measured static
 * prefix for this operation is 5,810 characters — `openai-prompt.test.ts` caps
 * it at 6,000 — and the user-message wrapper is 32, so the context ceiling is
 * `4 * maxInputTokens` less roughly 6,064.
 *
 * The first derivation sized the context to M3-01B's `maxInputTokens: 8_000`,
 * which left 24,000 bytes and gave training history 5,800 — about 11 sessions
 * at the corpus's largest session, against ADR-013's 20-session cap. The
 * product owner decided on 12 August 2026 to raise the ceiling instead, so the
 * full window fits. This table is the re-derivation. Only the training-history
 * line moved; every other source keeps the allocation approved on 11 August.
 *
 * Every number is either fixed by an accepted ADR or measured against the
 * shared synthetic corpus in `docs/decisions/support/m3-01b-bakeoff/`, whose 24
 * sessions serialize through `toCompletionReference` to 323-501 bytes, mean
 * 392, and whose memory items run 177-1,082 bytes:
 *
 * | source              | items | bytes  | basis                             |
 * | ------------------- | ----- | ------ | --------------------------------- |
 * | targetable goals    | 12    |  4,000 | 12 x 326-byte worst case = 3,912  |
 * | historical goals    |  8    |  2,400 | 8 x 300; background only          |
 * | memory              | 20    |  5,600 | corpus mean 420 B/item, max 1,082 |
 * | - history: sessions | 20    | 10,200 | 20 x the 501-byte corpus worst    |
 * | - history: misses   | 20    |  5,000 | 20 x 249-byte structural worst    |
 * | - history: envelope |       |    200 | window dates and counts: 147      |
 * | training history    |       | 15,400 | the three lines above             |
 * | plan commitments    | 12    |  1,400 | about 115 B/entry                 |
 * | planning note       |  1    |  1,200 | ADR-014 decision 4, fixed         |
 * | regeneration note   |  1    |    600 | ADR-014 decision 4, fixed         |
 * | previous proposal   |  1    |  2,200 | reduced form, regeneration only   |
 * | sum of parts        |       | 32,800 |                                   |
 * | envelope + total    |       | 33,700 | 900 for keys and dates; 769 used  |
 *
 * That total sets the ceiling: `ceil((6_000 + 64 + 33_700) / 4)` is 9,941, so
 * `maxInputTokens` is 10,000 — the smallest hundred above the requirement,
 * because a reservation charges the whole ceiling before the call and every
 * token of slack is money held on every generation.
 *
 * The sum of the parts is below the total, so the whole-context check can only
 * fire after a per-source check has already named a source — which is what
 * keeps "generation is unavailable" from being an error nobody can act on.
 *
 * Two sources behave differently on overflow, and the difference is deliberate.
 * Goals, memory, the note and the previous proposal are things the owner can
 * see and curate, so exceeding them denies with the source named (decision 4a).
 * Training history is not: it is whatever the owner happened to log, and
 * refusing to generate because they trained a lot would be a refusal they could
 * not act on. ADR-013 decisions 1 and 7 make that a bounded, disclosed
 * reduction instead.
 *
 * That is also why training history is split into a completion sub-budget and a
 * whole-source ceiling. Only the completion list trims by bytes. The miss list
 * trims by count alone, up to 20 entries of 249 bytes, and the envelope is
 * fixed — so a whole-source ceiling that did not reserve room for both would
 * turn a full miss list into exactly the denial ADR-013 forbids.
 */
export const COACH_AI_CONTEXT_LIMITS = {
  create_roadmap: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 8,
    maxMemoryItems: 20,
    maxTrainingSessions: 20,
    maxPlanCommitments: 12,
    bytes: {
      targetableGoals: 4_000,
      historicalGoals: 2_400,
      memory: 5_600,
      trainingHistory: 15_400,
      trainingHistoryCompletions: 10_200,
      planCommitments: 1_400,
      planningNote: 1_200,
      regenerationFeedback: 600,
      previousProposal: 2_200,
      total: 33_700,
    },
  },
  // M3-03 kept every number M3-02 provisionally set here, and this comment
  // records that as a decision rather than as inheritance. A selected horizon
  // is one to seven days, so the plan needs no larger goal, memory, or history
  // allocation than a roadmap does, and it needs a smaller total: 28,500 rather
  // than 33,700, because there is no 52-week forward window to describe.
  //
  // The 5,200 bytes of headroom that buys is spent on the prompt.
  // `openai-prompt.test.ts` holds the plan prefix under 7,000 characters rather
  // than the roadmap's 6,000, and the same ceiling still binds:
  // `ceil((7_000 + 64 + 28_500) / 4)` is 8,891 against `maxInputTokens` 10,000.
  // The extra thousand characters are what state the horizon rule, the
  // unweighted-allocation rule, and the "no sets, reps, or paces" boundary to
  // the model, all three of which the validator would otherwise only reject
  // after the call had been paid for.
  create_seven_day_plan: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 5,
    maxMemoryItems: 20,
    maxTrainingSessions: 20,
    maxPlanCommitments: 12,
    bytes: {
      targetableGoals: 4_000,
      historicalGoals: 1_600,
      memory: 5_600,
      trainingHistory: 11_000,
      trainingHistoryCompletions: 5_800,
      planCommitments: 1_400,
      planningNote: 1_200,
      regenerationFeedback: 600,
      previousProposal: 2_200,
      total: 28_500,
    },
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
  training: TrainingHistoryRecords;
  /**
   * The IANA zone `today` was derived in. Optional because `create_roadmap`
   * does not require one and M3-02's accepted context source does not supply
   * it; required in fact for `create_seven_day_plan`, where every date in the
   * horizon is an owner-local calendar date and a plan built in the wrong zone
   * covers the wrong days.
   */
  timezoneName?: string | null;
  /**
   * The exact records that informed the request, as ids and revisions. Carried
   * from the context source rather than derived here, because only the source
   * knows which revision of each record it actually read.
   */
  sources?: CoachAISourceReference[];
};

export type CoachAIComposeInput = {
  horizonStartDate: string;
  horizonEndDate: string;
  planningNote: string | null;
  regenerationFeedback: string | null;
  previousProposal: CoachAIPreviousProposalReference | null;
};

export type CoachAIAssembledContext = {
  context: CoachAIContext;
  serialized: string;
  serializedBytes: number;
  /** Per-source byte usage, for the compose disclosure and for tests. */
  usage: Record<Exclude<CoachAIContextSourceName, "whole_context">, number>;
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
  compose: CoachAIComposeInput,
  limits: CoachAIContextLimits = COACH_AI_CONTEXT_LIMITS[operation],
): CoachAIAssembledContext {
  if (
    !isIsoDate(records.today) ||
    !isIsoDate(compose.horizonStartDate) ||
    !isIsoDate(compose.horizonEndDate) ||
    // A one-day horizon is a legitimate plan request, so the bound is "ends
    // before it starts" rather than "is not longer than a day". `create_roadmap`
    // is unaffected: its own four-week minimum is enforced by the database and
    // by the horizon derivation that produced these dates.
    compose.horizonEndDate < compose.horizonStartDate
  ) {
    throw new CoachAIError("context_invalid");
  }

  const goals = selectActiveGoalContext(records.goals);
  const memoryItems = selectActiveMemoryContext(records.memory, records.today);

  // Decision 5: the threshold, checked before anything is claimed or reserved.
  // It names every missing requirement at once rather than the first one, so an
  // owner who is missing both is not sent round twice.
  if (operation === "create_seven_day_plan") {
    const missing: PlanContextRequirement[] = [];
    if (goals.targetable.length === 0) missing.push("active_goal");
    if (!isResolvedTimezone(records.timezoneName)) {
      missing.push("resolved_timezone");
    }
    if (missing.length > 0) {
      throw new CoachAIContextBelowMinimumError(missing);
    }
  }

  if (goals.targetable.length > limits.maxTargetableGoals) {
    throw new CoachAIContextTooLargeError("targetable_goals");
  }
  if (goals.historical.length > limits.maxHistoricalGoals) {
    throw new CoachAIContextTooLargeError("historical_goals");
  }
  if (memoryItems.length > limits.maxMemoryItems) {
    throw new CoachAIContextTooLargeError("memory");
  }

  const targetableGoals = goals.targetable.map(toGoalReference);
  const historicalGoals = goals.historical.map(toGoalReference);

  // Decision 1: name every active goal whose target lies outside the selected
  // horizon, so the proposal cannot imply that the roadmap reaches it.
  const goalsOutsideHorizon = targetableGoals
    .filter(
      (goal) =>
        goal.targetDate !== null && goal.targetDate > compose.horizonEndDate,
    )
    .map((goal) => goal.id);

  const training = selectTrainingHistoryContext(
    { ...records.training, horizonEndDate: compose.horizonEndDate },
    {
      maxSessions: limits.maxTrainingSessions,
      // The completion sub-budget, not the whole-source ceiling: the miss list
      // and the envelope share that ceiling and neither trims by bytes.
      maxBytes: limits.bytes.trainingHistoryCompletions,
      maxPlanCommitments: limits.maxPlanCommitments,
      maxPlanCommitmentBytes: limits.bytes.planCommitments,
    },
  );

  const context: CoachAIContext = {
    today: records.today,
    horizonStartDate: compose.horizonStartDate,
    horizonEndDate: compose.horizonEndDate,
    targetableGoals,
    historicalGoals,
    goalsOutsideHorizon,
    memory: memoryItems.map(toMemoryReference),
    trainingHistory: training.history,
    planCommitments: training.planCommitments,
    hasSafetySignal: training.hasSafetySignal,
    planningNote: assertBounded(
      compose.planningNote,
      PLANNING_NOTE_MAX_LENGTH,
      "planning_note",
    ),
    regenerationFeedback: assertBounded(
      compose.regenerationFeedback,
      REGENERATION_FEEDBACK_MAX_LENGTH,
      "regeneration_feedback",
    ),
    previousProposal: compose.previousProposal,
  };

  const usage = {
    targetable_goals: jsonBytes(context.targetableGoals),
    historical_goals: jsonBytes(context.historicalGoals),
    memory: jsonBytes(context.memory),
    training_history: jsonBytes(context.trainingHistory),
    plan_commitments: jsonBytes(context.planCommitments),
    planning_note: jsonBytes(context.planningNote),
    regeneration_feedback: jsonBytes(context.regenerationFeedback),
    previous_proposal: jsonBytes(context.previousProposal),
  };

  // Ordered deliberately: the sources that deny are checked before the total,
  // so an owner is told which source to reduce rather than that "there is too
  // much to consider".
  refuseOver(
    usage.targetable_goals,
    limits.bytes.targetableGoals,
    "targetable_goals",
  );
  refuseOver(
    usage.historical_goals,
    limits.bytes.historicalGoals,
    "historical_goals",
  );
  refuseOver(usage.memory, limits.bytes.memory, "memory");
  refuseOver(usage.planning_note, limits.bytes.planningNote, "planning_note");
  refuseOver(
    usage.regeneration_feedback,
    limits.bytes.regenerationFeedback,
    "regeneration_feedback",
  );
  refuseOver(
    usage.previous_proposal,
    limits.bytes.previousProposal,
    "previous_proposal",
  );

  // Training history and plan commitments were already trimmed to their
  // allocation with disclosure, so these two can only fire if the selection and
  // the budget disagree. That is a configuration defect rather than something
  // an owner did, and it should fail loudly rather than quietly send more than
  // the budget.
  //
  // The whole-source ceiling is checked here, not the completion sub-budget:
  // the selection bounds completions by bytes but bounds the miss list by count
  // alone, so the ceiling has to have reserved room for a full miss list. It
  // has — 5,000 bytes of the 15,400 — which is what stops an owner who missed
  // twenty planned sessions from being denied a roadmap for it.
  refuseOver(
    usage.training_history,
    limits.bytes.trainingHistory,
    "training_history",
  );
  refuseOver(
    usage.plan_commitments,
    limits.bytes.planCommitments + 100,
    "plan_commitments",
  );

  const serialized = JSON.stringify(context);
  const serializedBytes = byteLength(serialized);
  if (serializedBytes > limits.bytes.total) {
    throw new CoachAIContextTooLargeError("whole_context");
  }

  return {
    context,
    serialized,
    serializedBytes,
    usage,
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

function jsonBytes(value: unknown): number {
  return value === null || value === undefined
    ? 0
    : byteLength(JSON.stringify(value));
}

function refuseOver(
  used: number,
  allowed: number,
  source: CoachAIContextSourceName,
): void {
  if (used > allowed) throw new CoachAIContextTooLargeError(source);
}

function assertBounded(
  value: string | null,
  max: number,
  source: CoachAIContextSourceName,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new CoachAIError("context_invalid");
  }
  if (value.length > max) throw new CoachAIContextTooLargeError(source);
  return value;
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

/**
 * "Resolved" means the runtime can actually compute a local date in it. A
 * stored string nobody has ever asked `Intl` about is a zone name, not a
 * resolved timezone, and the difference only shows up as a plan on the wrong
 * days.
 */
export function isResolvedTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
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
