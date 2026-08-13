import { describe, expect, it } from "vitest";

import {
  buildCoachAIContext,
  byteLength,
  COACH_AI_CONTEXT_LIMITS,
  CoachAIContextBelowMinimumError,
  CoachAIContextTooLargeError,
  type CoachAIComposeInput,
  type CoachAIGoalRecord,
  type CoachAIOwnedRecords,
} from "@/server/ai/context";
import { COACH_AI_LIVE_LIMITS } from "@/server/ai/budget";
import { CoachAIError } from "@/server/ai/errors";
import type { MemoryItemView } from "@/server/memory/memory-records";
import type { TrainingHistoryRecords } from "@/server/training/training-history-context";

const TODAY = "2026-08-10";
const HORIZON_END = "2026-11-01";
const OWNER = "40000000-0000-4000-8000-000000000001";

const COMPOSE: CoachAIComposeInput = {
  horizonStartDate: TODAY,
  horizonEndDate: HORIZON_END,
  planningNote: null,
  regenerationFeedback: null,
  previousProposal: null,
};

function goal(overrides: Partial<CoachAIGoalRecord> = {}): CoachAIGoalRecord {
  return {
    id: "a1000000-0000-4000-8000-000000000001",
    title: "Run a hilly half marathon",
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-10-15",
    status: "active",
    archivedAt: null,
    ...overrides,
  };
}

function memoryItem(overrides: Partial<MemoryItemView> = {}): MemoryItemView {
  return {
    id: "c3000000-0000-4000-8000-000000000001",
    memoryType: "constraint",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: null,
    content: "Trains before work on weekdays.",
    revisionNumber: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    history: [],
    ...overrides,
  };
}

const EMPTY_TRAINING: TrainingHistoryRecords = {
  today: TODAY,
  horizonEndDate: HORIZON_END,
  completions: [],
  plannedSessions: [],
};

function records(
  overrides: Partial<CoachAIOwnedRecords> = {},
): CoachAIOwnedRecords {
  return {
    ownerId: OWNER,
    today: TODAY,
    goalCollectionRevision: 1,
    memoryCollectionRevision: 1,
    goals: [goal()],
    memory: [memoryItem()],
    training: EMPTY_TRAINING,
    ...overrides,
  };
}

function build(
  recordOverrides: Partial<CoachAIOwnedRecords> = {},
  composeOverrides: Partial<CoachAIComposeInput> = {},
) {
  return buildCoachAIContext("create_roadmap", records(recordOverrides), {
    ...COMPOSE,
    ...composeOverrides,
  });
}

describe("coach AI context assembly", () => {
  it("copies only the allowlisted goal and memory fields", () => {
    const assembled = build();

    expect(assembled.context.targetableGoals).toEqual([
      {
        id: "a1000000-0000-4000-8000-000000000001",
        title: "Run a hilly half marathon",
        category: "performance_event",
        priorityTier: "core",
        targetDate: "2026-10-15",
      },
    ]);
    expect(assembled.context.memory).toEqual([
      {
        id: "c3000000-0000-4000-8000-000000000001",
        memoryType: "constraint",
        content: "Trains before work on weekdays.",
      },
    ]);
    // Nothing spreads the source record, so a column added later stays invisible.
    expect(assembled.serialized).not.toContain("archivedAt");
    expect(assembled.serialized).not.toContain("provenance");
  });

  it("excludes paused, abandoned, and archived goals", () => {
    const assembled = build({
      goals: [
        goal(),
        goal({ id: "a1000000-0000-4000-8000-000000000002", status: "paused" }),
        goal({
          id: "a1000000-0000-4000-8000-000000000003",
          status: "abandoned",
        }),
        goal({
          id: "a1000000-0000-4000-8000-000000000004",
          archivedAt: "2026-07-01T00:00:00.000Z",
        }),
        goal({
          id: "a1000000-0000-4000-8000-000000000005",
          status: "achieved",
        }),
      ],
    });

    expect(assembled.context.targetableGoals).toHaveLength(1);
    expect(assembled.context.historicalGoals).toHaveLength(1);
  });

  it("names every active goal whose target lies outside the horizon", () => {
    const assembled = build({
      goals: [
        goal(),
        goal({
          id: "a1000000-0000-4000-8000-000000000009",
          targetDate: "2027-06-19",
        }),
      ],
    });

    // Decision 1: a later target is visibly outside this roadmap rather than
    // silently dropped, so the proposal cannot imply the roadmap reaches it.
    expect(assembled.context.goalsOutsideHorizon).toEqual([
      "a1000000-0000-4000-8000-000000000009",
    ]);
  });

  it("excludes proposed, rejected, archived, and review-due memory", () => {
    const assembled = build({
      memory: [
        memoryItem(),
        memoryItem({
          id: "c3000000-0000-4000-8000-000000000002",
          status: "proposed",
        }),
        memoryItem({
          id: "c3000000-0000-4000-8000-000000000003",
          status: "rejected",
        }),
        memoryItem({
          id: "c3000000-0000-4000-8000-000000000004",
          status: "archived",
        }),
        memoryItem({
          id: "c3000000-0000-4000-8000-000000000005",
          expiresOn: "2026-08-01",
        }),
      ],
    });

    expect(assembled.context.memory).toHaveLength(1);
  });

  it("returns the record ids that informed the request", () => {
    const assembled = build();

    expect(assembled.references).toEqual({
      goalIds: ["a1000000-0000-4000-8000-000000000001"],
      memoryIds: ["c3000000-0000-4000-8000-000000000001"],
    });
  });
});

describe("the per-source context allocation", () => {
  const limits = COACH_AI_CONTEXT_LIMITS.create_roadmap;

  it("never lets the whole-context ceiling fire before a source is named", () => {
    // The point of the allocation. ADR-014's finding was that a single total
    // with independent item caps produces a refusal nobody can act on, because
    // the error does not say which source is at fault. Keeping the sum of the
    // parts at or below the total means a per-source check always fires first.
    const sumOfParts =
      limits.bytes.targetableGoals +
      limits.bytes.historicalGoals +
      limits.bytes.memory +
      limits.bytes.trainingHistory +
      limits.bytes.planCommitments +
      limits.bytes.planningNote +
      limits.bytes.regenerationFeedback +
      limits.bytes.previousProposal;

    expect(sumOfParts).toBeLessThanOrEqual(limits.bytes.total);
  });

  it("fits inside the approved input ceiling with the real prompt in front of it", () => {
    // The binding constraint is not ADR-013's "roughly 30,000 bytes"; it is
    // `maxInputTokens` and the adapter's four-characters-per-token refusal
    // guard over the whole message set. Measured against the prefix budget
    // `openai-prompt.test.ts` enforces rather than against today's prefix, so
    // this cannot pass only because the prompt happens to be short right now.
    const staticPrefixBudget = 6_000;
    const wrapperAllowance = 64;
    const estimatedTokens = Math.ceil(
      (staticPrefixBudget + wrapperAllowance + limits.bytes.total) / 4,
    );

    expect(estimatedTokens).toBe(9_941);
    expect(estimatedTokens).toBeLessThanOrEqual(
      COACH_AI_LIVE_LIMITS.maxInputTokens,
    );
    expect(COACH_AI_LIVE_LIMITS.maxInputTokens).toBe(10_000);
  });

  it("reserves room in the training-history ceiling for a full miss list", () => {
    // Only the completion list trims by bytes. The miss list trims by count
    // alone — up to `maxTrainingSessions` entries of 249 bytes at the
    // allowlist's field caps — and the window envelope is fixed at 147. A
    // whole-source ceiling that did not reserve for both would turn an owner
    // who missed twenty planned sessions into a denial, which is exactly what
    // ADR-013 decisions 1 and 7 forbid for this source.
    const missListWorstCase = limits.maxTrainingSessions * 249;
    const envelope = 147;

    expect(
      limits.bytes.trainingHistoryCompletions + missListWorstCase + envelope,
    ).toBeLessThanOrEqual(limits.bytes.trainingHistory);
  });

  it("carries the whole 20-session window for a corpus-realistic history", () => {
    // The point of the 12 August 2026 decision to raise `maxInputTokens`. At
    // the previous 5,800-byte allocation the window held about 11 sessions at
    // the corpus's largest session; ADR-013's cap is 20.
    const largestCorpusSession = 501;

    expect(
      Math.floor(
        limits.bytes.trainingHistoryCompletions / largestCorpusSession,
      ),
    ).toBeGreaterThanOrEqual(limits.maxTrainingSessions);
  });

  it("names the memory source when curated memory exceeds its allocation", () => {
    // The exact failure ADR-014 recorded: 40 items at 1,000 characters was
    // 40,000 bytes against a 12,000-byte total, and the owner was told only
    // that there was too much to consider.
    const large = Array.from({ length: 8 }, (_, index) =>
      memoryItem({
        id: `c3000000-0000-4000-8000-00000000000${index}`,
        content: "x".repeat(1000),
      }),
    );

    try {
      build({ memory: large });
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CoachAIContextTooLargeError);
      expect((error as CoachAIContextTooLargeError).source).toBe("memory");
      expect((error as CoachAIContextTooLargeError).code).toBe(
        "context_too_large",
      );
    }
  });

  it("names the goal source when too many goals are active", () => {
    const many = Array.from({ length: 13 }, (_, index) =>
      goal({ id: `a1000000-0000-4000-8000-0000000000${index + 10}` }),
    );

    try {
      build({ goals: many });
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect((error as CoachAIContextTooLargeError).source).toBe(
        "targetable_goals",
      );
    }
  });

  it("admits the maximum permitted goals at their worst-case size", () => {
    // The count cap and the byte allocation must agree, or the count cap is a
    // number that never binds and the byte cap is a surprise.
    const many = Array.from({ length: 12 }, (_, index) =>
      goal({
        id: `a1000000-0000-4000-8000-0000000000${index + 10}`,
        title: "t".repeat(120),
        category: "c".repeat(60),
      }),
    );

    const assembled = build({ goals: many });
    expect(assembled.context.targetableGoals).toHaveLength(12);
    expect(assembled.usage.targetable_goals).toBeLessThanOrEqual(
      limits.bytes.targetableGoals,
    );
  });

  it("still generates for an owner whose window is full and who missed everything", () => {
    // The denial this ticket's re-derivation removed. `selectTrainingHistoryContext`
    // bounds the completion list by bytes but bounds the miss list by count
    // alone, so a full window plus a full miss list at the allowlist's field
    // caps used to exceed the source ceiling and refuse — a `context_too_large`
    // an owner could neither see nor act on, which is exactly what ADR-013
    // decisions 1 and 7 rule out for this source.
    const completions = Array.from({ length: 25 }, (_, index) => ({
      localDate: shiftDate(TODAY, -index),
      status: "completed",
      title: "t".repeat(120),
      sport: "s".repeat(80),
      durationMinutes: 90,
      perceivedEffort: 7,
      feeling: "as_expected",
      painReported: false,
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: "n".repeat(400),
      replacementDescription: null,
      correctionReason: null,
      activityNames: ["a".repeat(120)],
    }));
    const plannedSessions = Array.from({ length: 25 }, (_, index) => ({
      localDate: shiftDate(TODAY, -(index + 1)),
      title: "t".repeat(120),
      sport: "s".repeat(80),
      isLocked: false,
      hasCompletion: false,
    }));

    const assembled = build({
      training: { ...EMPTY_TRAINING, completions, plannedSessions },
    });

    expect(
      assembled.context.trainingHistory.missedPlannedSessions,
    ).toHaveLength(20);
    expect(assembled.context.trainingHistory.sessionsIncluded).toBeGreaterThan(
      0,
    );
    expect(assembled.usage.training_history).toBeLessThanOrEqual(
      limits.bytes.trainingHistory,
    );
  });

  it("trims training history by count and discloses the reduction", () => {
    // ADR-013 decision 1: a bounded reduction, not a denial, and the coach is
    // told how many sessions the window held against how many it received. A
    // model that silently receives a subset reasons as though it saw
    // everything.
    const completions = Array.from({ length: 30 }, (_, index) => ({
      localDate: shiftDate(TODAY, -index),
      status: "completed",
      title: "Easy run",
      sport: "Running",
      durationMinutes: 45,
      perceivedEffort: 4,
      feeling: "good",
      painReported: false,
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: null,
      replacementDescription: null,
      correctionReason: null,
      activityNames: ["Easy run"],
    }));

    const assembled = build({
      training: { ...EMPTY_TRAINING, completions },
    });

    const history = assembled.context.trainingHistory;
    expect(history.sessionsInWindow).toBe(30);
    // Since 12 August 2026 the count cap is what binds, not the byte
    // allocation: the full 20-session window travels and the trim is the cap
    // ADR-013 decision 1 set. The disclosure still states what actually went.
    expect(history.sessionsIncluded).toBe(20);
    expect(history.sessionsIncluded).toBeLessThan(history.sessionsInWindow);
    expect(history.completions).toHaveLength(history.sessionsIncluded);
    expect(assembled.usage.training_history).toBeLessThanOrEqual(
      limits.bytes.trainingHistory,
    );
    // Newest first, so the trim keeps the most recent training.
    expect(assembled.context.trainingHistory.completions[0].localDate).toBe(
      TODAY,
    );
  });

  it("truncates completion free text rather than denying", () => {
    const assembled = build({
      training: {
        ...EMPTY_TRAINING,
        completions: [
          {
            localDate: TODAY,
            status: "completed",
            title: "Long run",
            sport: "Running",
            durationMinutes: 120,
            perceivedEffort: 6,
            feeling: "rough",
            painReported: true,
            illnessReported: false,
            injuryReported: false,
            severeFatigueReported: false,
            note: "n".repeat(2000),
            replacementDescription: null,
            correctionReason: null,
            activityNames: ["Long run"],
          },
        ],
      },
    });

    expect(assembled.context.trainingHistory.completions[0].note).toHaveLength(
      400,
    );
    expect(assembled.context.hasSafetySignal).toBe(true);
  });

  it("reports the flag without inferring severity or recovery", () => {
    // Decision 7 forbids a severity classifier, an elapsed-time clearance rule,
    // and an inferred resolved state. The context carries the boolean and
    // nothing derived from it.
    const assembled = build({
      training: {
        ...EMPTY_TRAINING,
        completions: [
          {
            localDate: shiftDate(TODAY, -40),
            status: "completed",
            title: "Hill repeats",
            sport: "Running",
            durationMinutes: 50,
            perceivedEffort: 8,
            feeling: "rough",
            painReported: false,
            illnessReported: false,
            injuryReported: true,
            severeFatigueReported: false,
            note: "Rolled an ankle.",
            replacementDescription: null,
            correctionReason: null,
            activityNames: ["Hill repeats"],
          },
        ],
      },
    });

    // Forty days ago is still inside the eight-week window, and time passing is
    // not recovery.
    expect(assembled.context.hasSafetySignal).toBe(true);
    expect(assembled.serialized).not.toContain("severity");
    expect(assembled.serialized).not.toContain("resolved");
  });

  it("sends locked entries beyond the horizon and every entry inside it", () => {
    const assembled = build({
      training: {
        ...EMPTY_TRAINING,
        plannedSessions: [
          {
            localDate: shiftDate(TODAY, 3),
            title: "Club run",
            sport: "Running",
            isLocked: false,
            hasCompletion: false,
          },
          {
            localDate: shiftDate(TODAY, 150),
            title: "Autumn race",
            sport: "Running",
            isLocked: true,
            hasCompletion: false,
          },
          {
            localDate: shiftDate(TODAY, 150),
            title: "Speculative session",
            sport: "Running",
            isLocked: false,
            hasCompletion: false,
          },
        ],
      },
    });

    // ADR-013 decision 5: inside the horizon, every entry with its lock state.
    // Beyond it, locked entries only — a locked race is what a taper aims at,
    // and an unlocked one out there is noise.
    expect(assembled.context.planCommitments.map((c) => c.title)).toEqual([
      "Club run",
      "Autumn race",
    ]);
  });

  it("names the previous proposal when a regeneration carries too much", () => {
    try {
      build(
        {},
        {
          previousProposal: {
            title: "t".repeat(80),
            summary: "s".repeat(600),
            phases: Array.from({ length: 6 }, () => ({
              title: "p".repeat(80),
              focus: "f".repeat(300),
              startDate: TODAY,
              endDate: HORIZON_END,
            })),
          },
          regenerationFeedback: "Too much volume.",
        },
      );
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect((error as CoachAIContextTooLargeError).source).toBe(
        "previous_proposal",
      );
    }
  });

  it("admits a realistic regeneration inside every allocation", () => {
    const assembled = build(
      {},
      {
        planningNote: "I am away the first weekend of every month.",
        regenerationFeedback: "The base phase is too long.",
        previousProposal: {
          title: "Fifteen weeks to a hilly half",
          summary: "Base, then race-specific work, then a short taper.",
          phases: [
            {
              title: "Aerobic base",
              focus: "Easy volume with one weekly hill circuit.",
              startDate: TODAY,
              endDate: "2026-09-14",
            },
          ],
        },
      },
    );

    expect(assembled.serializedBytes).toBeLessThanOrEqual(limits.bytes.total);
    expect(assembled.context.regenerationFeedback).toBe(
      "The base phase is too long.",
    );
  });
});

describe("what the assembled context refuses", () => {
  it("rejects an impossible today", () => {
    expect(() => build({ today: "2026-02-30" })).toThrow(CoachAIError);
  });

  it("rejects a horizon that ends before it starts", () => {
    expect(() => build({}, { horizonEndDate: "2026-08-01" })).toThrow(
      CoachAIError,
    );
  });

  it("rejects a goal id that is not a canonical UUID", () => {
    expect(() => build({ goals: [goal({ id: "not-a-uuid" })] })).toThrow(
      CoachAIError,
    );
  });

  it("accepts a horizon that starts and ends on the same date", () => {
    // A one-day plan is a real request. The bound is "ends before it starts",
    // not "is not longer than a day".
    expect(() =>
      buildCoachAIContext(
        "create_seven_day_plan",
        records({ timezoneName: "Europe/Berlin" }),
        { ...COMPOSE, horizonStartDate: TODAY, horizonEndDate: TODAY },
      ),
    ).not.toThrow();
  });

  it("refuses the plan operation below its context minimum", () => {
    const compose = {
      ...COMPOSE,
      horizonStartDate: TODAY,
      horizonEndDate: "2026-08-16",
    };

    expect(() =>
      buildCoachAIContext(
        "create_seven_day_plan",
        records({ goals: [], timezoneName: "Europe/Berlin" }),
        compose,
      ),
    ).toThrow(CoachAIContextBelowMinimumError);

    expect(() =>
      buildCoachAIContext(
        "create_seven_day_plan",
        records({ timezoneName: null }),
        compose,
      ),
    ).toThrow(CoachAIContextBelowMinimumError);

    // A goal that is not active does not meet the minimum either: the threshold
    // is what the coach may actually be pointed at, not what exists.
    expect(() =>
      buildCoachAIContext(
        "create_seven_day_plan",
        records({
          goals: [goal({ status: "achieved" })],
          timezoneName: "Europe/Berlin",
        }),
        compose,
      ),
    ).toThrow(CoachAIContextBelowMinimumError);
  });

  it("measures bytes rather than characters", () => {
    // A note written in German is longer in bytes than in characters, which is
    // exactly why ADR-014 reserved 1,200 bytes for a 1,000-character field.
    expect(byteLength("Grüße")).toBe(7);
    expect("Grüße".length).toBe(5);
  });
});

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
