import "server-only";

import {
  GOAL_SPORT_MAX_LENGTH,
  GOAL_SPORTS_MAX,
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
  RoadmapProposal,
  CoachAIGoalReference,
  CoachAIMemoryReference,
  CoachAIOperation,
  CoachAIPreviousPlanReference,
  CoachAIPreviousProposalReference,
  CoachAISourceReference,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import {
  PLANNING_NOTE_MAX_LENGTH,
  REGENERATION_FEEDBACK_MAX_LENGTH,
} from "@/server/ai/owner-text";
import {
  selectCoachProfileContext,
  type CoachProfileRecords,
} from "@/server/profile/coach-profile-context";
import {
  buildCurrentRoadmapReference,
  buildRoadmapPlanContext,
} from "@/server/roadmap/roadmap-plan-context";
import {
  buildSessionDetailContext,
  type SessionDetailRecords,
} from "@/server/session-detail/session-detail-context";
import {
  MAX_RECURRING_SESSIONS,
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
  | "athlete"
  | "training_setup"
  | "targetable_goals"
  | "historical_goals"
  | "memory"
  | "training_history"
  | "plan_commitments"
  | "planning_note"
  | "regeneration_feedback"
  | "previous_proposal"
  | "roadmap"
  | "current_roadmap"
  | "session_detail"
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
  /**
   * Recurring series sent as rules (ADR-013 decision 5, amended 2 October
   * 2026). Zero for every operation except `create_roadmap`.
   */
  maxRecurringSessions: number;
  /** Per-source ceilings on the serialized bytes of that source alone. */
  bytes: {
    /**
     * ADR-023. Four values of fixed shape, so this can only be exceeded by a
     * defect in the selection.
     */
    athlete: number;
    /**
     * ADR-023. Curated by the owner, so exceeding it refuses with the source
     * named, as goals and memory do. At the field limits and one byte a
     * character the whole setup is about 4,300 bytes.
     */
    trainingSetup: number;
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
    /**
     * M3-16B. Like training history and unlike goals, this trims rather than
     * denies: `buildRoadmapPlanContext` reduces to this ceiling with the
     * reduction disclosed, so the check here can only fire if that ladder and
     * this number disagree. Zero for `create_roadmap`, which never carries one.
     */
    roadmap: number;
    /**
     * ADR-023 decision 8. The roadmap in force, as a new roadmap is told of
     * it: trimmed to this with the loss counted, never denied. Zero for every
     * operation except `create_roadmap`.
     */
    currentRoadmap: number;
    /**
     * A7-2. Trims rather than denies, like the roadmap: every list inside it is
     * reduced to its share of `SESSION_DETAIL_BYTES` with the loss counted.
     * Zero for every operation except `fill_session_activities`.
     */
    sessionDetail: number;
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
 * prefix for this operation was 5,810 characters then, and is 5,957 since the
 * recurring-sessions sentence of 2 October 2026 — `openai-prompt.test.ts` caps
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
 * | targetable goals    | 12    |  4,000 | a limit, not a worst case: below  |
 * | historical goals    |  8    |  2,400 | a limit too; background only      |
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
 * | envelope + total    |       | 33,700 | 900 for keys and dates; 803 used  |
 *
 * The goals line stopped being a worst case on 7 Oct 2026 (ADR-012, amended):
 * a goal is sent with its sports, up to ten of sixty characters, so one goal
 * can approach 940 bytes where with a category it could not pass 326. The
 * owner kept 4,000 as a limit no real set of goals reaches; past it the
 * request is refused with goals named, like the other curated sources. Achieved
 * goals carry their sports as well and are refused the same way.
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
/*
 * ADR-023, 9 October 2026. Every operation gained three things: the athlete's
 * basics (200 bytes), the training setup (4,600) and each active goal's
 * desired outcome (goals 4,000 to 10,000 for the roadmap, 8,000 otherwise).
 * The shared prompt grew by the three paragraphs that describe them, and
 * `maxInputTokens` went to 15,000. The arithmetic the comments below give is
 * from before that day; this is what holds now, and `context.test.ts` and
 * `openai-prompt.test.ts` assert it:
 *
 *   roadmap  prefix 7,700 + wrapper 64 + context 48,850 = 56,614  14,154 tokens
 *   plan     prefix 8,700 + wrapper 64 + context 51,200 = 59,964  14,991 tokens
 *   fill     prefix 7,300 + wrapper 64 + context 41,300 = 48,664  12,166 tokens
 *
 * The roadmap and plan lines include their own parts of ADR-023 (decisions 6
 * to 8 and 11 to 13). The plan's `total` now holds the sum of its parts, which
 * it did not before; the comment on it says what that took. The fill line is
 * still only the shared part, and its own part has the rest of its room.
 */
export const COACH_AI_CONTEXT_LIMITS = {
  create_roadmap: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 8,
    maxMemoryItems: 20,
    maxTrainingSessions: 20,
    // 12 in 1,400 bytes until ADR-023 decisions 6 and 7: a race months out
    // was cut by a dozen nearer sessions, and each entry now carries minutes.
    maxPlanCommitments: 30,
    maxRecurringSessions: MAX_RECURRING_SESSIONS,
    bytes: {
      athlete: 200,
      trainingSetup: 4_600,
      // 4,000 until ADR-023: a goal now carries its desired outcome, up to a
      // thousand characters. Still a limit, not a worst case: twelve goals
      // at their longest are past 23,000 bytes, and no real set is.
      targetableGoals: 10_000,
      historicalGoals: 2_400,
      memory: 5_600,
      trainingHistory: 15_400,
      trainingHistoryCompletions: 10_200,
      planCommitments: 4_400,
      planningNote: 1_200,
      regenerationFeedback: 600,
      previousProposal: 2_200,
      // A roadmap is not planned against itself.
      roadmap: 0,
      // Six phases of 80-character titles with their dates are about 900.
      currentRoadmap: 1_200,
      sessionDetail: 0,
      // 33,700 until ADR-023, which added the athlete, the training setup and
      // 6,000 more for goals, with 100 for the two new keys. Then 3,000 more
      // for planned sessions and 1,250 for the roadmap in force and its key.
      total: 48_850,
    },
  },
  // M3-03 kept every number M3-02 provisionally set here, and this comment
  // records that as a decision rather than as inheritance. A selected horizon
  // is one to seven days, so the plan needs no larger goal, memory, or history
  // allocation than a roadmap does, and it needed a smaller total: 28,500
  // rather than 33,700, because there is no 52-week forward window to describe.
  //
  // The 5,200 bytes of headroom that bought is spent on the prompt.
  // `openai-prompt.test.ts` holds the plan prefix under 7,000 characters rather
  // than the roadmap's 6,000. The extra thousand characters are what state the
  // horizon rule, the unweighted-allocation rule, and the "no sets, reps, or
  // paces" boundary to the model, all three of which the validator would
  // otherwise only reject after the call had been paid for.
  //
  // M3-16B spends the rest of it. The plan gained one source — the accepted
  // roadmap covering the horizon — and the total rose 28,500 to 32,500 to hold
  // it, while the prefix budget rose 7,000 to 7,400 for the paragraph that
  // describes the field. That is the whole ceiling, with 9 tokens over:
  //
  //   prefix 7,400 + wrapper 64 + context 32,500 = 39,964 characters
  //   ceil(39,964 / 4) = 9,991  against  maxInputTokens 10,000
  //
  // 4,000 is what that headroom allowed rather than what a roadmap wants: the
  // stored content may reach 16,000 bytes (`ROADMAP_CONTENT_MAX_BYTES`), which
  // is why the roadmap reaches a coach reduced by `roadmap-plan-context.ts` and
  // never as stored. There is no headroom left after this. A source added next
  // takes bytes from another source or raises `maxInputTokens`, and the second
  // is a standing spend increase, because a reservation charges the ceiling
  // before every live call whether or not the source was large.
  //
  // ADR-024 and the ceiling of 9 October 2026. `maxInputTokens` is 14,000 now,
  // and the first thing it buys is this: the planned sessions go from twelve
  // entries in 1,400 bytes to thirty in 4,000, because an entry inside the
  // days being planned carries its minutes and its replace handle, and seven
  // days can hold more than twelve sessions. The total and the prefix budget
  // grow by the same step:
  //
  //   prefix 8,000 + wrapper 64 + context 35,100 = 43,164 characters
  //   ceil(43,164 / 4) = 10,791  against  maxInputTokens 14,000
  //
  // An entry is about 110 bytes with a short title and at most about 290, so
  // 4,000 holds thirty ordinary ones and fewer of the longest. The days being
  // planned are fitted first; a marked session that still does not fit refuses
  // the request with this source named rather than dropping the mark.
  create_seven_day_plan: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 5,
    maxMemoryItems: 20,
    maxTrainingSessions: 20,
    maxPlanCommitments: 30,
    maxRecurringSessions: 0,
    bytes: {
      athlete: 200,
      trainingSetup: 4_600,
      // 8,000 where the roadmap has 10,000: the roadmap is where a goal's
      // outcome sets direction, and the plan already reads that roadmap.
      targetableGoals: 8_000,
      // 1,600 until ADR-023 decision 12; see `total` below.
      historicalGoals: 1_200,
      memory: 5_600,
      // 11,000 and 5,800 until ADR-023 decision 12: about a dozen of the
      // twenty logs fitted. 9,700 holds twenty at the corpus mean of 392 bytes
      // and nineteen at its worst of 501; the roadmap's 10,200 would have
      // put the whole past the ceiling (see `total`).
      trainingHistory: 14_900,
      trainingHistoryCompletions: 9_700,
      planCommitments: 4_000,
      planningNote: 1_200,
      regenerationFeedback: 600,
      // 2,200 until 24 September 2026, which was the roadmap's number adopted
      // before anything filled it. A rejected *plan* is days, not phases, and
      // `plan_content_is_valid` permits up to three sessions a day across seven
      // days at 120-character titles and 60-character sports: a legal worst case
      // reduces to about 5,800 bytes, so the old ceiling refused proposals the
      // database was happy to store.
      //
      // Raised rather than solved by truncating the reduction, because the
      // truncation would be silent and this costs nothing: a measured plan
      // context is 8,589 bytes of the pool below, so 6,400 here still leaves
      // room many times over. `context.test.ts` measures the legal worst case
      // against this number rather than trusting the arithmetic.
      //
      // 5,900 since ADR-023: the legal worst case measures under it, and the
      // 500 it gives back is part of what lets `total` hold every part.
      previousProposal: 5_900,
      roadmap: 4_000,
      currentRoadmap: 0,
      sessionDetail: 0,
      // The sum of the parts (50,200) and 1,000 for the envelope, whose
      // largest piece is twelve goal ids outside the horizon. Until ADR-023
      // decision 12 this was below the sum, on the reasoning that no request
      // fills every part at once; the refusal that would then fire named no
      // source. It cannot fire now before a part has named itself, and the
      // whole is exactly the ceiling:
      //
      //   prefix 8,700 + wrapper 64 + context 51,200 = 59,964 characters
      //   ceil(59,964 / 4) = 14,991  against  maxInputTokens 15,000
      total: 51_200,
    },
  },
  // A7-2, within ADR-020. One session rather than a horizon, so the plan's
  // long-range sources are absent: no historical goals, no roadmap, no
  // previous proposal, no plan commitments, and training history is the last
  // seven days only (`trainingSelectionFor`), kept so a pain, illness,
  // injury or fatigue flag still steers the coach conservatively. What it adds
  // is `sessionDetail`, whose parts are sized in `session-detail-context.ts`.
  //
  // The owner's request note is bounded at 500 characters by the action, and
  // 1,600 bytes is what 500 characters can need at three bytes each (CJK) plus
  // the quotes: refusing a note the action accepted would be a refusal the
  // owner could not predict.
  //
  //   prefix 7,000 + wrapper 64 + context 32,400 = 39,464 characters
  //   ceil(39,464 / 4) = 9,866  against  maxInputTokens 10,000
  //
  // It stays under the shared ceiling, so this operation needs none of the
  // plan's missing headroom. A ceiling of its own, which would reserve less per
  // call, is a separate change: `maxInputTokens` is one number today.
  fill_session_activities: {
    maxTargetableGoals: 12,
    maxHistoricalGoals: 0,
    maxMemoryItems: 20,
    maxTrainingSessions: 10,
    maxPlanCommitments: 0,
    maxRecurringSessions: 0,
    bytes: {
      athlete: 200,
      trainingSetup: 4_600,
      targetableGoals: 8_000,
      // Always empty here, and an empty list is its two brackets.
      historicalGoals: 2,
      memory: 5_600,
      trainingHistory: 4_400,
      trainingHistoryCompletions: 4_000,
      planCommitments: 0,
      planningNote: 1_600,
      regenerationFeedback: 0,
      previousProposal: 0,
      roadmap: 0,
      currentRoadmap: 0,
      sessionDetail: 16_000,
      total: 41_300,
    },
  },
} as const satisfies Record<CoachAIOperation, CoachAIContextLimits>;

/**
 * ADR-023 decision 13: how far past the last planned day the plan operation
 * reads dated sessions.
 */
export const PLAN_FORWARD_DAYS_PAST_HORIZON = 28;

/** The days of training history `fill_session_activities` reads: this week. */
export const SESSION_DETAIL_HISTORY_DAYS = 7;

/**
 * The training history an operation actually reads.
 *
 * The plan and the roadmap read ADR-013's whole window. Filling one session
 * reads the last seven days of it (the owner's choice of 28 September 2026)
 * and no planned sessions at all — its week is `sessionDetail.week` — so eight
 * weeks do not crowd out the library and the actuals the operation exists to
 * use. The narrowing goes through `windowDays` rather than by filtering first,
 * so the window dates and counts the coach is told describe the seven days it
 * was actually sent. Shared by assembly and by the context source's
 * source-recording, which must agree on what was sent.
 */
export function trainingSelectionFor(
  operation: CoachAIOperation,
  training: TrainingHistoryRecords,
): { records: TrainingHistoryRecords; windowDays: number | undefined } {
  if (operation !== "fill_session_activities") {
    return { records: training, windowDays: undefined };
  }
  return {
    records: { ...training, plannedSessions: [] },
    windowDays: SESSION_DETAIL_HISTORY_DAYS,
  };
}

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 120;
const MAX_MEMORY_CONTENT_LENGTH = 1000;
/** The goal form's own limit (`goal-records.ts`). */
const MAX_DESIRED_OUTCOME_LENGTH = 1000;

/**
 * The goal fields context assembly needs, stated structurally so this module
 * never imports the repository. The repository's `Goal` satisfies it.
 */
export type CoachAIGoalRecord = GoalContextCandidate & {
  id: string;
  title: string;
  desiredOutcome: string;
  sports: string[];
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
   * ADR-023. The profile fields the coach may read, already owner-scoped.
   * Assembly reduces them with `selectCoachProfileContext`; absent means an
   * owner with nothing entered, not a missing requirement.
   */
  profile?: CoachProfileRecords | null;
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
  /**
   * The accepted roadmap version in force, as stored and unreduced.
   *
   * The one record handed to assembly whole. Reducing it needs the composed
   * horizon to know which phase the week falls in, and the context source is
   * deliberately not given the compose input — so `buildCoachAIContext` runs
   * `buildRoadmapPlanContext` over it, exactly as it runs
   * `selectTrainingHistoryContext` over training history. Nothing here is
   * serialized: `context.roadmap` holds the reduction, and this field is not
   * on `CoachAIContext` at all.
   *
   * Absent or `null` is the ordinary goals-only path, not a missing
   * requirement.
   */
  roadmapVersion?: CoachAIRoadmapVersionRecord | null;
  /**
   * A7-2. The session being filled and what the source selected around it,
   * field-copied but not yet sized. Read for `fill_session_activities` only;
   * assembly sizes it with `buildSessionDetailContext`.
   */
  sessionDetail?: SessionDetailRecords | null;
};

/** An accepted roadmap version, as the repository returns it. */
export type CoachAIRoadmapVersionRecord = {
  id: string;
  versionNumber: number;
  content: RoadmapProposal;
};

export type CoachAIComposeInput = {
  horizonStartDate: string;
  horizonEndDate: string;
  planningNote: string | null;
  regenerationFeedback: string | null;
  previousProposal:
    | CoachAIPreviousProposalReference
    | CoachAIPreviousPlanReference
    | null;
  /**
   * ADR-024, `create_seven_day_plan` only: the sessions the owner marked "can
   * be replaced" for this request, each with the handle the database issued.
   * The id is how a planned session is matched and is never serialized.
   */
  replaceable?: readonly { sessionId: string; handle: string }[];
  /**
   * The planned session `fill_session_activities` fills. The context source is
   * built with the same id and reads that session; assembly refuses when the
   * two disagree.
   */
  sessionId?: string | null;
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
  references: {
    goalIds: string[];
    memoryIds: string[];
    /**
     * The accepted roadmap version this request was actually planned under, or
     * `null`. Returned so the domain caller can record it as a proposal source:
     * assembly is what decided whether a roadmap was sent, so assembly is what
     * knows whether there is lineage to record.
     */
    roadmapVersion: { id: string; versionNumber: number } | null;
    /**
     * A7-3. The session a fill was for, and the library entries, saved
     * sessions and logs whose content survived sizing. Assembly decided what
     * was sent, so assembly names it; empty for every other operation.
     */
    sessionDetailSources: CoachAISourceReference[];
  };
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

  const selectedGoals = selectActiveGoalContext(records.goals);
  // Filling one session serves the goals the athlete holds now; an achieved
  // goal is background for a roadmap and nothing to a session's exercises.
  const goals =
    operation === "fill_session_activities"
      ? { ...selectedGoals, historical: [] }
      : selectedGoals;
  const memoryItems = selectActiveMemoryContext(records.memory, records.today);
  const sessionDetailRecords = requireSessionDetail(
    operation,
    records,
    compose,
  );
  const sessionDetailAssembly =
    sessionDetailRecords === null
      ? null
      : buildSessionDetailContext(sessionDetailRecords);

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

  // M3-16B. The gate on the one record the source hands over whole: what
  // reaches a provider is this reduction and never `records.roadmapVersion`.
  // Guarded by operation here as well as at the source, so a source that
  // supplied one for `create_roadmap` still sends nothing — two independent
  // refusals, because this is the file that decides what a request carries.
  //
  // The goals it is checked against are the targetable ones, which is the same
  // set `accept_roadmap_proposal` recognizes for a goal source: active or
  // achieved.
  const roadmapVersion =
    operation === "create_seven_day_plan"
      ? (records.roadmapVersion ?? null)
      : null;
  const roadmapContext =
    roadmapVersion === null
      ? null
      : buildRoadmapPlanContext({
          roadmap: roadmapVersion.content,
          horizonStartDate: compose.horizonStartDate,
          horizonEndDate: compose.horizonEndDate,
          targetableGoalIds: new Set(goals.targetable.map((goal) => goal.id)),
        });

  // ADR-023 decision 8. Only a new roadmap is told of the one in force, and
  // only its outline; the plan reads the reduction above instead.
  const currentRoadmap =
    operation !== "create_roadmap"
      ? undefined
      : records.roadmapVersion
        ? buildCurrentRoadmapReference(
            records.roadmapVersion.content,
            limits.bytes.currentRoadmap,
          )
        : null;

  // ADR-023: the outcome travels on a goal the athlete is working toward,
  // not on one already achieved.
  const targetableGoals = goals.targetable.map((goal) =>
    toGoalReference(goal, true),
  );
  const historicalGoals = goals.historical.map((goal) =>
    toGoalReference(goal, false),
  );
  const profile = selectCoachProfileContext(records.profile, records.today);

  // Decision 1: name every active goal whose target lies outside the selected
  // horizon, so the proposal cannot imply that the roadmap reaches it.
  const goalsOutsideHorizon = targetableGoals
    .filter(
      (goal) =>
        goal.targetDate !== null && goal.targetDate > compose.horizonEndDate,
    )
    .map((goal) => goal.id);

  const trainingSelection = trainingSelectionFor(operation, records.training);
  const training = selectTrainingHistoryContext(
    {
      ...trainingSelection.records,
      horizonStartDate: compose.horizonStartDate,
      horizonEndDate: compose.horizonEndDate,
    },
    {
      windowDays: trainingSelection.windowDays,
      maxSessions: limits.maxTrainingSessions,
      // The completion sub-budget, not the whole-source ceiling: the miss list
      // and the envelope share that ceiling and neither trims by bytes.
      maxBytes: limits.bytes.trainingHistoryCompletions,
      maxPlanCommitments: limits.maxPlanCommitments,
      maxPlanCommitmentBytes: limits.bytes.planCommitments,
      maxRecurringSessions: limits.maxRecurringSessions,
      // Keyed off the operation, not off the list being empty, so a plan
      // context has one shape whether or not anything was marked.
      ...(operation === "create_seven_day_plan"
        ? {
            commitmentDetail: {
              replaceHandles: new Map(
                (compose.replaceable ?? []).map((mark) => [
                  mark.sessionId,
                  mark.handle,
                ]),
              ),
            },
            forwardDaysPastHorizon: PLAN_FORWARD_DAYS_PAST_HORIZON,
          }
        : operation === "create_roadmap"
          ? { commitmentDetail: {} }
          : {}),
    },
  );

  // A mark that matched no session sent would be a handle the database will
  // accept and the coach was never shown. Refused rather than dropped: the
  // owner chose from a list, and a proposal that ignores part of the choice
  // without saying so is the silent reduction this module exists to prevent.
  if (
    operation !== "create_seven_day_plan" &&
    (compose.replaceable?.length ?? 0) > 0
  ) {
    throw new CoachAIError("context_invalid");
  }
  const sentHandles = new Set(
    training.planCommitments.map((commitment) => commitment.replaceHandle),
  );
  if (
    (compose.replaceable ?? []).some((mark) => !sentHandles.has(mark.handle))
  ) {
    throw new CoachAIContextTooLargeError("plan_commitments");
  }

  const context: CoachAIContext = {
    today: records.today,
    horizonStartDate: compose.horizonStartDate,
    horizonEndDate: compose.horizonEndDate,
    athlete: profile.athlete,
    trainingSetup: profile.trainingSetup,
    targetableGoals,
    historicalGoals,
    goalsOutsideHorizon,
    memory: memoryItems.map(toMemoryReference),
    trainingHistory: training.history,
    planCommitments: training.planCommitments,
    // Keyed off the limit, not off the list being empty: an operation that
    // sends no rules must not gain a key, or every one of its contexts grows.
    ...(limits.maxRecurringSessions > 0
      ? { recurringSessions: training.recurringSessions }
      : {}),
    // Keyed off the operation, for the reason the rules above are.
    ...(currentRoadmap === undefined ? {} : { currentRoadmap }),
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
    // `create_roadmap` never carries one, whatever the source handed in: a
    // roadmap is not planned against itself, and a source that supplied one
    // would otherwise quietly widen what a roadmap request sends.
    roadmap: roadmapContext,
    // Only the operation that fills a session carries one, for the same reason.
    sessionDetail: sessionDetailAssembly?.context ?? null,
  };

  const usage = {
    athlete: jsonBytes(context.athlete),
    training_setup: jsonBytes(context.trainingSetup),
    targetable_goals: jsonBytes(context.targetableGoals),
    historical_goals: jsonBytes(context.historicalGoals),
    memory: jsonBytes(context.memory),
    training_history: jsonBytes(context.trainingHistory),
    // The rules share this allocation, so they are counted in it.
    plan_commitments:
      jsonBytes(context.planCommitments) +
      (context.recurringSessions === undefined
        ? 0
        : jsonBytes(context.recurringSessions)),
    planning_note: jsonBytes(context.planningNote),
    regeneration_feedback: jsonBytes(context.regenerationFeedback),
    previous_proposal: jsonBytes(context.previousProposal),
    roadmap: jsonBytes(context.roadmap),
    current_roadmap: jsonBytes(context.currentRoadmap),
    session_detail: jsonBytes(context.sessionDetail),
  };

  // Ordered deliberately: the sources that deny are checked before the total,
  // so an owner is told which source to reduce rather than that "there is too
  // much to consider".
  refuseOver(usage.athlete, limits.bytes.athlete, "athlete");
  refuseOver(
    usage.training_setup,
    limits.bytes.trainingSetup,
    "training_setup",
  );
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
  // Same class as the two above: `buildRoadmapPlanContext` has already reduced
  // to this ceiling with every step disclosed, so reaching this line means the
  // ladder and the budget disagree. A configuration defect, not something the
  // owner did, and it should fail loudly rather than send more than the budget.
  refuseOver(usage.roadmap, limits.bytes.roadmap, "roadmap");
  refuseOver(
    usage.current_roadmap,
    limits.bytes.currentRoadmap,
    "current_roadmap",
  );
  // The same class again: every list inside was already fitted to its share.
  refuseOver(
    usage.session_detail,
    limits.bytes.sessionDetail,
    "session_detail",
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
      // Keyed off the reduction rather than off the record that was read: a
      // version that was read but not sent is not a source.
      roadmapVersion:
        context.roadmap === null || roadmapVersion === null
          ? null
          : {
              id: roadmapVersion.id,
              versionNumber: roadmapVersion.versionNumber,
            },
      sessionDetailSources: sessionDetailAssembly?.sources ?? [],
    },
  };
}

/**
 * The session a fill request is about, or `null` for every other operation.
 *
 * Refused rather than defaulted: a fill with no session, a session other than
 * the one composed for, one that was cancelled or is already in the past, or a
 * horizon that is not that session's day is a caller defect, and answering it
 * would propose activities for training nobody can still do. The past-date
 * rule is the one `apply_rolling_plan_change_set` enforces on an edit, so a
 * proposal is never made for a session its own save would refuse.
 */
function requireSessionDetail(
  operation: CoachAIOperation,
  records: CoachAIOwnedRecords,
  compose: CoachAIComposeInput,
): SessionDetailRecords | null {
  if (operation !== "fill_session_activities") {
    if (compose.sessionId) throw new CoachAIError("context_invalid");
    return null;
  }
  const detail = records.sessionDetail ?? null;
  if (
    detail === null ||
    !compose.sessionId ||
    detail.session.id !== compose.sessionId ||
    detail.session.status !== "active" ||
    detail.session.localDate < records.today ||
    compose.horizonStartDate !== detail.session.localDate ||
    compose.horizonEndDate !== detail.session.localDate ||
    compose.regenerationFeedback !== null ||
    compose.previousProposal !== null
  ) {
    throw new CoachAIError("context_invalid");
  }
  return detail;
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
function toGoalReference(
  goal: CoachAIGoalRecord,
  withDesiredOutcome: boolean,
): CoachAIGoalReference {
  if (
    !CANONICAL_UUID_PATTERN.test(goal.id) ||
    !isBounded(goal.title, MAX_TITLE_LENGTH) ||
    // The form requires an outcome, so an empty one is a row older than
    // that rule: it is left out below rather than refusing the request.
    (withDesiredOutcome &&
      (typeof goal.desiredOutcome !== "string" ||
        goal.desiredOutcome.length > MAX_DESIRED_OUTCOME_LENGTH)) ||
    goal.sports.length > GOAL_SPORTS_MAX ||
    !goal.sports.every((sport) => isBounded(sport, GOAL_SPORT_MAX_LENGTH)) ||
    (goal.priorityTier !== "core" && goal.priorityTier !== "supporting") ||
    (goal.targetDate !== null && !isIsoDate(goal.targetDate))
  ) {
    throw new CoachAIError("context_invalid");
  }

  return {
    id: goal.id,
    title: goal.title,
    ...(withDesiredOutcome && goal.desiredOutcome.trim().length > 0
      ? { desiredOutcome: goal.desiredOutcome }
      : {}),
    sports: [...goal.sports],
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
