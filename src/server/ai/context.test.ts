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
import type { SessionDetailRecords } from "@/server/session-detail/session-detail-context";
import type {
  TrainingHistoryCompletion,
  TrainingHistoryRecords,
} from "@/server/training/training-history-context";

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
    desiredOutcome: "Finish strong on the climbs.",
    sports: ["Running"],
    priorityTier: "core",
    targetDate: "2026-10-15",
    status: "active",
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
  series: [],
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
    // The repository's goal carries more than the coach may read. The
    // desired outcome is read since ADR-023, on a goal being worked toward.
    const stored = { ...goal(), activeRank: 1 };
    const achieved = {
      ...goal({
        id: "a1000000-0000-4000-8000-000000000009",
        status: "achieved",
        desiredOutcome: "ACHIEVED-OUTCOME-THAT-MUST-NOT-TRAVEL",
      }),
    };
    const assembled = build({ goals: [stored, achieved] });

    expect(assembled.context.targetableGoals).toEqual([
      {
        id: "a1000000-0000-4000-8000-000000000001",
        title: "Run a hilly half marathon",
        desiredOutcome: "Finish strong on the climbs.",
        sports: ["Running"],
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
    // An achieved goal is background: its outcome stays behind.
    expect(assembled.context.historicalGoals[0]).not.toHaveProperty(
      "desiredOutcome",
    );
    expect(assembled.serialized).not.toContain("MUST-NOT-TRAVEL");
    expect(assembled.serialized).not.toContain("activeRank");
    expect(assembled.serialized).not.toContain("provenance");
  });

  it("sends the athlete's basics and the training setup on every operation", () => {
    const profile = {
      birthDate: "1992-03-14",
      gender: "female",
      heightCm: 171,
      latestWeightKg: 64.5,
      training: {
        sessionsPerWeek: 4,
        unavailableDays: ["sunday"],
        availabilityNote: "Late on Thursdays.",
        trainingPlaces: ["Home", "Gym"],
        homeEquipment: ["Kettlebell"],
      },
    };
    const roadmap = build({ profile });
    const plan = buildCoachAIContext(
      "create_seven_day_plan",
      records({ profile, timezoneName: "Europe/Berlin" }),
      { ...COMPOSE, horizonEndDate: shiftDate(TODAY, 6) },
    );

    for (const assembled of [roadmap, plan]) {
      expect(assembled.context.athlete).toEqual({
        age: expect.any(Number),
        gender: "female",
        heightCm: 171,
        weightKg: 64.5,
      });
      expect(assembled.context.trainingSetup).toEqual({
        sessionsPerWeek: 4,
        unavailableDays: ["Sunday"],
        availabilityNote: "Late on Thursdays.",
        trainingPlaces: ["Home", "Gym"],
        homeEquipment: ["Kettlebell"],
      });
      // An age, not the day it is counted from.
      expect(assembled.serialized).not.toContain("1992-03-14");
      expect(assembled.serialized).not.toContain("birthDate");
    }
  });

  it("tells the coach nothing is known, rather than refusing, with no profile", () => {
    const assembled = build({ profile: null });

    expect(assembled.context.athlete).toEqual({
      age: null,
      gender: null,
      heightCm: null,
      weightKg: null,
    });
    expect(assembled.context.trainingSetup.trainingPlaces).toEqual([]);
  });

  it("names the training setup when it is too large to send", () => {
    // Forty names of sixty characters, each three bytes: the form allows it,
    // and it is the owner's to shorten.
    const profile = {
      birthDate: null,
      gender: null,
      heightCm: null,
      latestWeightKg: null,
      training: {
        sessionsPerWeek: null,
        unavailableDays: [],
        availabilityNote: null,
        trainingPlaces: [],
        homeEquipment: Array.from({ length: 40 }, (_, index) =>
          `${index}`.padEnd(60, "\u6f22"),
        ),
      },
    };

    try {
      build({ profile });
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect((error as CoachAIContextTooLargeError).source).toBe(
        "training_setup",
      );
    }
  });

  it("holds every part of a plan request inside its total (ADR-023 decision 12)", () => {
    const bytes = COACH_AI_CONTEXT_LIMITS.create_seven_day_plan.bytes;
    // Until this decision the plan's total was below the sum of its parts,
    // and a request that filled them all was refused naming no source.
    const sumOfParts =
      bytes.athlete +
      bytes.trainingSetup +
      bytes.targetableGoals +
      bytes.historicalGoals +
      bytes.memory +
      bytes.trainingHistory +
      bytes.planCommitments +
      bytes.planningNote +
      bytes.regenerationFeedback +
      bytes.previousProposal +
      bytes.roadmap;
    // The envelope: the keys, three dates, a flag, and at most twelve goal
    // ids outside the horizon.
    const envelope = 1_000;

    expect(sumOfParts + envelope).toBeLessThanOrEqual(bytes.total);
  });

  it("gives the roadmap and the plan the minutes of every planned session", () => {
    const training = {
      ...EMPTY_TRAINING,
      plannedSessions: [
        {
          localDate: shiftDate(TODAY, 2),
          title: "Long run",
          sport: "Running",
          durationMinutes: 75,
          hasCompletion: false,
          ruleSeriesId: null,
        },
        {
          localDate: shiftDate(TODAY, 20),
          title: "Trail day",
          sport: "Running",
          durationMinutes: 180,
          hasCompletion: false,
          ruleSeriesId: null,
        },
      ],
    };
    const roadmap = build({ training });
    const plan = buildCoachAIContext(
      "create_seven_day_plan",
      records({ training, timezoneName: "Europe/Berlin" }),
      { ...COMPOSE, horizonEndDate: shiftDate(TODAY, 6) },
    );

    // The roadmap replaces nothing, so no entry of its carries a handle.
    expect(roadmap.context.planCommitments).toEqual([
      expect.objectContaining({ title: "Long run", durationMinutes: 75 }),
      expect.objectContaining({ title: "Trail day", durationMinutes: 180 }),
    ]);
    expect(roadmap.serialized).not.toContain("replaceHandle");
    // The plan: a handle inside the chosen days, minutes everywhere.
    expect(plan.context.planCommitments).toEqual([
      {
        localDate: shiftDate(TODAY, 2),
        title: "Long run",
        sport: "Running",
        durationMinutes: 75,
        replaceHandle: null,
      },
      {
        localDate: shiftDate(TODAY, 20),
        title: "Trail day",
        sport: "Running",
        durationMinutes: 180,
      },
    ]);
  });

  it("reads a plan's dated sessions 28 days past its last day, and a roadmap's 180", () => {
    const session = (offset: number, title: string) => ({
      localDate: shiftDate(TODAY, offset),
      title,
      sport: "Running",
      hasCompletion: false,
      ruleSeriesId: null,
    });
    const training = {
      ...EMPTY_TRAINING,
      // The plan ends six days out: 34 is its last day read, 35 is past it.
      plannedSessions: [session(34, "Race in a month"), session(35, "Later")],
    };
    const plan = buildCoachAIContext(
      "create_seven_day_plan",
      records({ training, timezoneName: "Europe/Berlin" }),
      { ...COMPOSE, horizonEndDate: shiftDate(TODAY, 6) },
    );
    const roadmap = build({ training });

    expect(plan.context.planCommitments.map((c) => c.title)).toEqual([
      "Race in a month",
    ]);
    expect(roadmap.context.planCommitments.map((c) => c.title)).toEqual([
      "Race in a month",
      "Later",
    ]);
  });

  it("excludes paused and abandoned goals", () => {
    const assembled = build({
      goals: [
        goal(),
        goal({ id: "a1000000-0000-4000-8000-000000000002", status: "paused" }),
        goal({
          id: "a1000000-0000-4000-8000-000000000003",
          status: "abandoned",
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
      // No roadmap was handed in, so none informed the request.
      roadmapVersion: null,
      sessionDetailSources: [],
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
    const staticPrefixBudget = 7_800;
    const wrapperAllowance = 64;
    const estimatedTokens = Math.ceil(
      (staticPrefixBudget + wrapperAllowance + limits.bytes.total) / 4,
    );

    // 9,941 until ADR-023 (9 October 2026): the athlete, the training setup
    // and each goal's desired outcome, with a longer shared prompt for them.
    // 12,991 after ADR-023's shared part; its roadmap part added thirty
    // planned sessions with minutes and the roadmap in force.
    expect(estimatedTokens).toBe(14_179);
    expect(estimatedTokens).toBeLessThanOrEqual(
      COACH_AI_LIVE_LIMITS.maxInputTokens,
    );
    expect(COACH_AI_LIVE_LIMITS.maxInputTokens).toBe(15_000);
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

  it("admits twelve goals with the longest title and a long sport", () => {
    // The allocation is a limit rather than a worst case since a goal is sent
    // with its sports (ADR-012, amended 7 Oct 2026). This is the size it must
    // still hold: the count cap, each goal at its longest title.
    const many = Array.from({ length: 12 }, (_, index) =>
      goal({
        id: `a1000000-0000-4000-8000-0000000000${index + 10}`,
        title: "t".repeat(120),
        sports: ["s".repeat(60)],
      }),
    );

    const assembled = build({ goals: many });
    expect(assembled.context.targetableGoals).toHaveLength(12);
    expect(assembled.usage.targetable_goals).toBeLessThanOrEqual(
      limits.bytes.targetableGoals,
    );
  });

  it("names goals when their sports carry them past the allocation", () => {
    // Each about 1,950 bytes with a full outcome: six pass the 10,000 the
    // roadmap allows.
    const many = Array.from({ length: 6 }, (_, index) =>
      goal({
        id: `a1000000-0000-4000-8000-0000000000${index + 10}`,
        title: "t".repeat(120),
        desiredOutcome: "o".repeat(1000),
        sports: Array.from({ length: 10 }, (_, sport) =>
          `${sport}`.padEnd(60, "s"),
        ),
      }),
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
      painReported: false,
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: "n".repeat(400),
      replacementDescription: null,
      activityNames: ["a".repeat(120)],
    }));
    const plannedSessions = Array.from({ length: 25 }, (_, index) => ({
      localDate: shiftDate(TODAY, -(index + 1)),
      title: "t".repeat(120),
      sport: "s".repeat(80),
      hasCompletion: false,
      ruleSeriesId: null,
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
      painReported: false,
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: null,
      replacementDescription: null,
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
            painReported: true,
            illnessReported: false,
            injuryReported: false,
            severeFatigueReported: false,
            note: "n".repeat(2000),
            replacementDescription: null,
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
            painReported: false,
            illnessReported: false,
            injuryReported: true,
            severeFatigueReported: false,
            note: "Rolled an ankle.",
            replacementDescription: null,
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

  it("sends every entry inside the horizon and, beyond it, the ones no rule describes", () => {
    const assembled = build({
      training: {
        ...EMPTY_TRAINING,
        plannedSessions: [
          {
            localDate: shiftDate(TODAY, 3),
            title: "Club run",
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: "77000000-0000-4000-8000-000000000009",
          },
          {
            localDate: shiftDate(TODAY, 150),
            title: "Autumn race",
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: null,
          },
          {
            localDate: shiftDate(TODAY, 150),
            title: "Club run, far out",
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: "77000000-0000-4000-8000-000000000009",
          },
          {
            localDate: shiftDate(TODAY, 181),
            title: "Next year's race",
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: null,
          },
        ],
      },
    });

    // ADR-013 decision 5 as amended on 9 October 2026: inside the horizon,
    // every entry. Beyond it, a single session - a race is what a taper aims
    // at - but not an unchanged occurrence of a series, and nothing past the
    // forward window.
    expect(assembled.context.planCommitments.map((c) => c.title)).toEqual([
      "Club run",
      "Autumn race",
    ]);
  });

  it("sends no lock state, which nothing sets any more", () => {
    const assembled = build({
      training: {
        ...EMPTY_TRAINING,
        plannedSessions: [
          {
            localDate: shiftDate(TODAY, 3),
            title: "Club run",
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: null,
          },
        ],
      },
    });

    expect(assembled.context.planCommitments).toEqual([
      {
        localDate: shiftDate(TODAY, 3),
        title: "Club run",
        sport: "Running",
        durationMinutes: null,
      },
    ]);
    expect(assembled.serialized).not.toContain("isLocked");
  });

  describe("a recurring series (ADR-013 decision 5, amended 2 October 2026)", () => {
    const SERIES_ID = "77000000-0000-4000-8000-000000000001";
    const weekly: TrainingHistoryRecords["series"][number] = {
      id: SERIES_ID,
      title: "Club run",
      sport: "Running",
      frequency: "weekly",
      intervalCount: 1,
      weekdays: [1, 4],
      startDate: shiftDate(TODAY, -30),
      endDate: null,
    };
    // Thirteen weeks of it, as the longer plan window writes them.
    const occurrences = Array.from({ length: 26 }, (_, index) => ({
      localDate: shiftDate(TODAY, 1 + index * 3),
      title: "Club run",
      sport: "Running",
      hasCompletion: false,
      ruleSeriesId: SERIES_ID,
    }));
    const race = {
      localDate: shiftDate(TODAY, 60),
      title: "Autumn race",
      sport: "Running",
      hasCompletion: false,
      ruleSeriesId: null,
    };

    it("reaches the roadmap once, as a rule, and leaves room for a race", () => {
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          plannedSessions: [...occurrences, race],
          series: [weekly],
        },
      });

      expect(assembled.context.recurringSessions).toEqual([
        {
          title: "Club run",
          sport: "Running",
          durationMinutes: null,
          frequency: "weekly",
          intervalCount: 1,
          weekdays: ["Monday", "Thursday"],
          startDate: shiftDate(TODAY, -30),
          endDate: null,
        },
      ]);
      // Without the rule the twelve nearest repeats would be the whole list
      // and the race sixty days out would never reach the coach.
      expect(assembled.context.planCommitments).toEqual([
        {
          localDate: shiftDate(TODAY, 60),
          title: "Autumn race",
          sport: "Running",
          durationMinutes: null,
        },
      ]);
      // The series' identity stays behind, as every other id does.
      expect(assembled.serialized).not.toContain(SERIES_ID);
    });

    it("keeps an occurrence dated when it is edited or moved", () => {
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          plannedSessions: [
            occurrences[0],
            // Edited or moved: the source hands it over with no rule.
            { ...occurrences[1], title: "Club run, short", ruleSeriesId: null },
            occurrences[2],
          ],
          series: [weekly],
        },
      });

      expect(assembled.context.planCommitments.map((c) => c.title)).toEqual([
        "Club run, short",
      ]);
    });

    it("sends no rule for a series that has ended or starts after the horizon", () => {
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series: [
            { ...weekly, id: "ended", endDate: shiftDate(TODAY, -1) },
            { ...weekly, id: "later", startDate: shiftDate(HORIZON_END, 1) },
          ],
        },
      });

      expect(assembled.context.recurringSessions).toEqual([]);
    });

    it("keeps a trimmed series' occurrences as dated entries", () => {
      // Seven series against a cap of six: the seventh gets no rule, so its
      // occurrence must not disappear with it.
      const series = Array.from({ length: 7 }, (_, index) => ({
        ...weekly,
        id: `series-${index}`,
        title: `Series ${index}`,
        startDate: shiftDate(TODAY, -30 + index),
      }));
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series,
          plannedSessions: series.map((entry, index) => ({
            localDate: shiftDate(TODAY, 2),
            title: entry.title,
            sport: "Running",
            hasCompletion: false,
            ruleSeriesId: `series-${index}`,
          })),
        },
      });

      expect(assembled.context.recurringSessions).toHaveLength(6);
      expect(assembled.context.planCommitments.map((c) => c.title)).toEqual([
        "Series 6",
      ]);
    });

    it("counts the rules inside the plan-commitment allocation", () => {
      const limits = COACH_AI_CONTEXT_LIMITS.create_roadmap;
      const series = Array.from({ length: 6 }, (_, index) => ({
        ...weekly,
        id: `series-${index}`,
        title: "t".repeat(120),
        sport: "s".repeat(80),
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        endDate: shiftDate(TODAY, 200),
      }));
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series,
          plannedSessions: Array.from({ length: 12 }, (_, index) => ({
            localDate: shiftDate(TODAY, index),
            title: "t".repeat(120),
            sport: "s".repeat(80),
            hasCompletion: false,
            ruleSeriesId: null,
          })),
        },
      });

      // Rules are fitted first and dated entries take what is left. Until
      // ADR-023 the allocation was 1,400 bytes, and at the longest title, sport
      // and weekday list three rules fitted and no dated entry did. At 4,400
      // all six rules fit and the dated entries share the rest. What is sent
      // never exceeds what the allocation allows.
      expect(assembled.context.recurringSessions).toHaveLength(6);
      expect(assembled.context.planCommitments.length).toBeGreaterThan(0);
      expect(assembled.context.planCommitments.length).toBeLessThan(12);
      expect(assembled.usage.plan_commitments).toBeLessThanOrEqual(
        limits.bytes.planCommitments + 100,
      );
    });

    it("fills with the nearest dated entries, so a full list cuts the furthest", () => {
      // Six ordinary series and a month of one-off sessions: more than the
      // thirty the list holds since ADR-023 (it was twelve, which a fortnight
      // filled). The race is the furthest entry out, and since Lock was
      // removed (owner, 9 Oct 2026) nothing ranks it above a nearer session.
      // ADR-013 records this as given up.
      const series = Array.from({ length: 6 }, (_, index) => ({
        ...weekly,
        id: `series-${index}`,
        title: `Series ${index}`,
      }));
      const oneOffs = Array.from({ length: 31 }, (_, index) => ({
        localDate: shiftDate(TODAY, index),
        title: `One-off ${index}`,
        sport: "Running",
        hasCompletion: false,
        ruleSeriesId: null,
      }));
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series,
          plannedSessions: [...oneOffs, race],
        },
      });

      expect(assembled.context.recurringSessions).toHaveLength(6);
      const titles = assembled.context.planCommitments.map((c) => c.title);
      expect(titles[0]).toBe("One-off 0");
      expect(titles).not.toContain("Autumn race");
      // Dated entries leave in date order.
      const dates = assembled.context.planCommitments.map((c) => c.localDate);
      expect(dates).toEqual([...dates].sort());
    });

    it("sends a daily rule with no weekdays", () => {
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series: [
            { ...weekly, frequency: "daily", intervalCount: 2, weekdays: null },
          ],
        },
      });

      expect(assembled.context.recurringSessions).toEqual([
        {
          title: "Club run",
          sport: "Running",
          durationMinutes: null,
          frequency: "daily",
          intervalCount: 2,
          weekdays: null,
          startDate: shiftDate(TODAY, -30),
          endDate: null,
        },
      ]);
    });

    it("sends no rule for a series ended from its own first day", () => {
      // The database allows an end one day before the start: a series that
      // was ended before it ever ran. It describes nothing.
      const start = shiftDate(TODAY, 5);
      const assembled = build({
        training: {
          ...EMPTY_TRAINING,
          series: [
            { ...weekly, startDate: start, endDate: shiftDate(TODAY, 4) },
          ],
        },
      });

      expect(assembled.context.recurringSessions).toEqual([]);
    });

    it("lists the days being planned before the days leading up to them", () => {
      // A first day ten days out, and three sessions on every day until
      // then: more than the list holds. Nearest first alone would fill it
      // before reaching the one session the coach is asked to plan around.
      const leadIn = Array.from({ length: 30 }, (_, index) => ({
        localDate: shiftDate(TODAY, Math.floor(index / 3)),
        title: `Lead-in ${index}`,
        sport: "Running",
        hasCompletion: false,
        ruleSeriesId: null,
      }));
      const inHorizon = {
        localDate: shiftDate(TODAY, 11),
        title: "Long run",
        sport: "Running",
        hasCompletion: false,
        ruleSeriesId: null,
      };
      const after = Array.from({ length: 4 }, (_, index) => ({
        localDate: shiftDate(TODAY, 20 + index),
        title: `After ${index}`,
        sport: "Running",
        hasCompletion: false,
        ruleSeriesId: null,
      }));
      const plan = buildCoachAIContext(
        "create_seven_day_plan",
        records({
          training: {
            ...EMPTY_TRAINING,
            plannedSessions: [...leadIn, inHorizon, ...after],
          },
          timezoneName: "Europe/Berlin",
        }),
        {
          ...COMPOSE,
          horizonStartDate: shiftDate(TODAY, 10),
          horizonEndDate: shiftDate(TODAY, 16),
        },
      );

      const titles = plan.context.planCommitments.map((c) => c.title);
      expect(titles).toHaveLength(30);
      expect(titles.slice(0, 5)).toEqual([
        "Long run",
        "After 0",
        "After 1",
        "After 2",
        "After 3",
      ]);
      // What is left goes to the days before, the nearest to the first day
      // first: that is the load carried into the planned days.
      const leadInDates = plan.context.planCommitments
        .slice(5)
        .map((c) => c.localDate);
      expect(leadInDates).toEqual([...leadInDates].sort().reverse());
      expect(leadInDates[0]).toBe(shiftDate(TODAY, 9));
      // Only a session inside the chosen days carries minutes and a handle.
      expect(plan.context.planCommitments[0]).toEqual({
        localDate: shiftDate(TODAY, 11),
        title: "Long run",
        sport: "Running",
        durationMinutes: null,
        replaceHandle: null,
      });
      // Outside them it carries its minutes and no handle (ADR-023).
      expect(plan.context.planCommitments[1]).toEqual({
        localDate: shiftDate(TODAY, 20),
        title: "After 0",
        sport: "Running",
        durationMinutes: null,
      });
    });

    it("gives a marked session its handle and minutes, and never its id", () => {
      const marked = "77000000-0000-4000-8000-0000000000b1";
      const training = {
        ...EMPTY_TRAINING,
        plannedSessions: [
          {
            id: marked,
            localDate: shiftDate(TODAY, 1),
            title: "Long run",
            sport: "Running",
            durationMinutes: 75,
            hasCompletion: false,
            ruleSeriesId: null,
          },
          {
            id: "77000000-0000-4000-8000-0000000000b2",
            localDate: shiftDate(TODAY, 2),
            title: "Strength",
            sport: "Strength",
            durationMinutes: 45,
            hasCompletion: false,
            ruleSeriesId: null,
          },
        ],
      };
      const plan = buildCoachAIContext(
        "create_seven_day_plan",
        records({ training, timezoneName: "Europe/Berlin" }),
        {
          ...COMPOSE,
          horizonEndDate: shiftDate(TODAY, 6),
          replaceable: [{ sessionId: marked, handle: "r1" }],
        },
      );

      expect(plan.context.planCommitments).toEqual([
        {
          localDate: shiftDate(TODAY, 1),
          title: "Long run",
          sport: "Running",
          durationMinutes: 75,
          replaceHandle: "r1",
        },
        {
          localDate: shiftDate(TODAY, 2),
          title: "Strength",
          sport: "Strength",
          durationMinutes: 45,
          replaceHandle: null,
        },
      ]);
      expect(plan.serialized).not.toContain(marked);

      // A mark on a session that is not sent is refused, not dropped.
      expect(() =>
        buildCoachAIContext(
          "create_seven_day_plan",
          records({ training, timezoneName: "Europe/Berlin" }),
          {
            ...COMPOSE,
            horizonEndDate: shiftDate(TODAY, 6),
            replaceable: [
              {
                sessionId: "77000000-0000-4000-8000-0000000000ff",
                handle: "r1",
              },
            ],
          },
        ),
      ).toThrow(CoachAIContextTooLargeError);
      // And no other operation takes a mark at all.
      expect(() =>
        build(
          { training },
          { replaceable: [{ sessionId: marked, handle: "r1" }] },
        ),
      ).toThrow(CoachAIError);
    });

    it("gives the seven-day plan and a fill no rules and no key for them", () => {
      const training = {
        ...EMPTY_TRAINING,
        plannedSessions: [occurrences[0]],
        series: [weekly],
      };
      const plan = buildCoachAIContext(
        "create_seven_day_plan",
        records({ training, timezoneName: "Europe/Berlin" }),
        { ...COMPOSE, horizonEndDate: shiftDate(TODAY, 6) },
      );

      expect(plan.serialized).not.toContain("recurringSessions");
      // Byte for byte what it sends when no series exists at all.
      expect(plan.serialized).toBe(
        buildCoachAIContext(
          "create_seven_day_plan",
          records({
            training: { ...training, series: [] },
            timezoneName: "Europe/Berlin",
          }),
          { ...COMPOSE, horizonEndDate: shiftDate(TODAY, 6) },
        ).serialized,
      );
      // Its horizon is days, so the occurrence is sent dated, as before.
      expect(plan.context.planCommitments.map((c) => c.title)).toEqual([
        "Club run",
      ]);
      expect(COACH_AI_CONTEXT_LIMITS.create_seven_day_plan).toMatchObject({
        maxRecurringSessions: 0,
      });
      expect(COACH_AI_CONTEXT_LIMITS.fill_session_activities).toMatchObject({
        maxRecurringSessions: 0,
      });
    });
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

/**
 * The roadmap gate, which is the half of M3-16B that `roadmap-plan-context`'s
 * own suite cannot reach: that module is a pure reducer and never sees which
 * operation is being built. What is asserted here is assembly's behaviour —
 * that a plan carries the reduction, that a roadmap request drops one even
 * when a source hands it over, and that the version only becomes lineage when
 * it was actually sent.
 */
describe("the accepted roadmap as plan context", () => {
  const ROADMAP_VERSION = {
    id: "b7000000-0000-4000-8000-000000000050",
    versionNumber: 3,
    content: {
      schemaVersion: "fittip.roadmap.v2",
      title: "Autumn 10k build",
      summary: "Twelve weeks from base to a 10k time trial.",
      startDate: "2026-08-01",
      endDate: "2026-12-01",
      phases: [
        {
          title: "Base building",
          focus: "Aerobic volume with one quality session a week.",
          startDate: "2026-08-01",
          endDate: "2026-11-01",
          goalAttention: [
            {
              goalId: "a1000000-0000-4000-8000-000000000001",
              level: "primary",
              reason: "Everything serves the half.",
            },
          ],
          milestones: [
            {
              title: "Long run at 90 minutes",
              observableCriterion: "One 90-minute run completed.",
              targetDate: "2026-09-21",
              goalIds: ["a1000000-0000-4000-8000-000000000001"],
            },
          ],
        },
        {
          title: "Sharpening",
          focus: "WITHHELD threshold work.",
          startDate: "2026-11-02",
          endDate: "2026-12-01",
          goalAttention: [
            {
              goalId: "a1000000-0000-4000-8000-000000000001",
              level: "secondary",
              reason: "WITHHELD",
            },
          ],
          milestones: [
            {
              title: "WITHHELD",
              observableCriterion: "WITHHELD",
              targetDate: "2026-11-20",
              goalIds: [],
            },
          ],
        },
      ],
      assumptions: ["WITHHELD four sessions a week."],
      uncertainties: [
        {
          statement: "WITHHELD",
          whyItMatters: "WITHHELD",
          whatToWatch: "WITHHELD",
        },
      ],
      reviewPoints: [{ title: "WITHHELD", question: "WITHHELD?" }],
      safetyConsiderations: ["WITHHELD"],
    },
  } as unknown as NonNullable<CoachAIOwnedRecords["roadmapVersion"]>;

  function plan(overrides: Partial<CoachAIOwnedRecords> = {}) {
    return buildCoachAIContext(
      "create_seven_day_plan",
      records({
        timezoneName: "Europe/Berlin",
        roadmapVersion: ROADMAP_VERSION,
        ...overrides,
      }),
      { ...COMPOSE, horizonEndDate: "2026-08-16" },
    );
  }

  it("carries the reduction, not the stored roadmap", () => {
    const assembled = plan();

    expect(assembled.context.roadmap).not.toBeNull();
    expect(assembled.context.roadmap?.coveringPhases).toHaveLength(1);
    expect(assembled.context.roadmap?.coveringPhases[0].title).toBe(
      "Base building",
    );
    expect(assembled.context.roadmap?.otherPhases).toEqual([
      {
        title: "Sharpening",
        startDate: "2026-11-02",
        endDate: "2026-12-01",
        goalAttention: [
          {
            goalId: "a1000000-0000-4000-8000-000000000001",
            level: "secondary",
          },
        ],
      },
    ]);
  });

  /**
   * The assertion that matters most, and the one nothing else makes: it reads
   * the serialized payload, which is what a provider would actually receive.
   */
  it("serializes nothing the owner withheld", () => {
    expect(plan().serialized).not.toContain("WITHHELD");
  });

  it("charges the roadmap against its own byte budget", () => {
    const assembled = plan();

    expect(assembled.usage.roadmap).toBeGreaterThan(0);
    expect(assembled.usage.roadmap).toBeLessThanOrEqual(
      COACH_AI_CONTEXT_LIMITS.create_seven_day_plan.bytes.roadmap,
    );
  });

  it("records the version as lineage once it has been sent", () => {
    expect(plan().references.roadmapVersion).toEqual({
      id: ROADMAP_VERSION.id,
      versionNumber: 3,
    });
  });

  /**
   * The second of the two independent refusals. The context source already
   * declines to read a roadmap for this operation; this proves assembly drops
   * one anyway, so a source that changed its mind could not widen what a
   * roadmap request sends.
   */
  it("tells a new roadmap the outline of the one in force, and nothing of what it said", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({ roadmapVersion: ROADMAP_VERSION }),
      COMPOSE,
    );
    const content = ROADMAP_VERSION.content;

    // ADR-023 decision 8: titles and dates, so the next roadmap continues
    // from where the athlete is.
    expect(assembled.context.currentRoadmap).toEqual({
      title: content.title,
      startDate: content.startDate,
      endDate: content.endDate,
      phases: content.phases.map((phase) => ({
        title: phase.title,
        startDate: phase.startDate,
        endDate: phase.endDate,
      })),
      phasesWithheld: 0,
    });
    // None of its prose: not the summary, a phase's focus or a milestone.
    expect(assembled.serialized).not.toContain(content.summary);
    for (const phase of content.phases) {
      expect(assembled.serialized).not.toContain(phase.focus);
      for (const milestone of phase.milestones) {
        expect(assembled.serialized).not.toContain(milestone.title);
      }
    }
    // The plan's reduction stays the plan's, and a roadmap built on another
    // is not recorded as planned under it.
    expect(assembled.context.roadmap).toBeNull();
    expect(assembled.references.roadmapVersion).toBeNull();
    expect(assembled.usage.roadmap).toBe(0);
    expect(assembled.usage.current_roadmap).toBeLessThanOrEqual(
      COACH_AI_CONTEXT_LIMITS.create_roadmap.bytes.currentRoadmap,
    );
  });

  it("says so when no roadmap is in force, and gives no other call the key", () => {
    expect(build().context.currentRoadmap).toBeNull();
    expect(plan().serialized).not.toContain("currentRoadmap");
  });

  it("does not call a roadmap that has ended the one being followed", () => {
    const ended = {
      ...ROADMAP_VERSION,
      content: {
        ...ROADMAP_VERSION.content,
        startDate: shiftDate(TODAY, -90),
        endDate: shiftDate(TODAY, -1),
      },
    };
    const lastDay = {
      ...ended,
      content: { ...ended.content, endDate: TODAY },
    };
    const outline = (roadmapVersion: typeof ended) =>
      buildCoachAIContext(
        "create_roadmap",
        records({ roadmapVersion }),
        COMPOSE,
      ).context.currentRoadmap;

    expect(outline(ended)).toBeNull();
    expect(outline(lastDay)).not.toBeNull();
  });

  it("counts the phases it leaves out when the outline does not fit", () => {
    const long = {
      ...ROADMAP_VERSION,
      content: {
        ...ROADMAP_VERSION.content,
        phases: Array.from({ length: 6 }, (_, index) => ({
          ...ROADMAP_VERSION.content.phases[0],
          // Eighty characters at three bytes each.
          title: `${index}`.padEnd(80, "\u6f22"),
        })),
      },
    };
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({ roadmapVersion: long }),
      COMPOSE,
    );
    const outline = assembled.context.currentRoadmap;

    expect(outline?.phasesWithheld).toBeGreaterThan(0);
    expect((outline?.phases.length ?? 0) + (outline?.phasesWithheld ?? 0)).toBe(
      6,
    );
    // The earliest go first: what is kept ends with the last phase.
    expect(outline?.phases.at(-1)?.title.startsWith("5")).toBe(true);
  });

  it("is the ordinary goals-only path when no roadmap covers the week", () => {
    const assembled = plan({ roadmapVersion: null });

    expect(assembled.context.roadmap).toBeNull();
    expect(assembled.references.roadmapVersion).toBeNull();
  });
});

describe("what a plan regeneration would cost", () => {
  // Measured rather than assumed, because the answer decides whether plan
  // regeneration needs `maxInputTokens` raised — and a raised ceiling is a
  // standing spend increase, charged on every call whether the room is used or
  // not. The figure that matters is the headroom left in the 32,500-byte pool
  // once every plan source is at its worst case: a regeneration adds the
  // feedback and a reduction of the proposal being rejected on top of that.
  const PLAN_LIMITS = COACH_AI_CONTEXT_LIMITS.create_seven_day_plan;

  // Not every source at its maximum: the allowances sum to 37,400 against a
  // 32,500 pool, so an all-maxed context refuses by construction and measuring
  // it would say nothing about a real owner. This is a heavy but real athlete —
  // four goals, a dozen memory items of ordinary length, a full twenty-session
  // training window, and a planning note a person would actually type.
  function realisticPlanContext(compose: Partial<CoachAIComposeInput> = {}) {
    const goals = Array.from({ length: 4 }, (_, index) =>
      goal({
        id: `a1000000-0000-4000-8000-0000000000${index + 10}`,
        title: "Run a hilly half marathon in the spring",
        sports: ["Running"],
      }),
    );
    const memory = Array.from({ length: 12 }, (_, index) =>
      memoryItem({
        id: `c3000000-0000-4000-8000-0000000000${index + 10}`,
        content:
          "Trains before work on weekdays and cannot run on consecutive hard days.",
      }),
    );
    const completions = Array.from({ length: 20 }, (_, index) => ({
      localDate: shiftDate(TODAY, -index),
      status: "completed",
      title: "Easy aerobic session",
      sport: "Running",
      durationMinutes: 50,
      perceivedEffort: 5,
      painReported: false,
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: "Felt comfortable the whole way, finished with something left.",
      replacementDescription: null,
      activityNames: ["Steady run"],
    }));

    return buildCoachAIContext(
      "create_seven_day_plan",
      records({
        goals,
        memory,
        timezoneName: "Europe/Berlin",
        training: { ...EMPTY_TRAINING, completions },
      }),
      {
        ...COMPOSE,
        planningNote:
          "I only have 45 minutes on weekdays and my left knee complains on hills.",
        ...compose,
      },
    );
  }

  // The gate that actually fires on a regeneration is the per-source ceiling,
  // not the pool: `refuseOver(usage.previous_proposal, ...)` runs before the
  // whole-context check. Measuring pool headroom therefore proves the wrong
  // thing, which is what the first version of this file did.
  it("admits the largest rejected plan the database would store", () => {
    // `plan_content_is_valid` permits three sessions a day across seven days,
    // titles to 120 characters and sports to 60. This is that, reduced.
    const previousProposal = {
      weekDescription: "w".repeat(600),
      days: Array.from({ length: 21 }, (_, index) => ({
        date: shiftDate(TODAY, index % 7),
        title: "t".repeat(120),
        sport: "s".repeat(60),
        durationMinutes: 180,
      })),
    };

    const assembled = realisticPlanContext({
      regenerationFeedback: "f".repeat(500),
      previousProposal,
    });

    expect(assembled.usage.previous_proposal).toBeLessThanOrEqual(
      PLAN_LIMITS.bytes.previousProposal,
    );
    expect(assembled.serializedBytes).toBeLessThanOrEqual(
      PLAN_LIMITS.bytes.total,
    );
  });

  it("leaves room in the pool for the feedback and the rejected proposal", () => {
    const assembled = realisticPlanContext();
    const headroom = PLAN_LIMITS.bytes.total - assembled.serializedBytes;
    const needed =
      PLAN_LIMITS.bytes.regenerationFeedback +
      PLAN_LIMITS.bytes.previousProposal;

    // Measured on 24 September 2026: 8,589 bytes of a 32,500 pool, leaving
    // 23,911 against the 2,800 a regeneration can add. The 9,991-token estimate
    // that made regeneration look blocked is computed from the *allowances*,
    // which sum to the pool; a real context serializes to about a quarter of
    // it. So plan regeneration needs no ceiling raise, and no source trimmed.
    //
    // This is an assertion rather than a note because the thing worth catching
    // is the day it stops being true — a source added later that quietly eats
    // the room regeneration was going to use.
    expect(headroom).toBeGreaterThan(needed);
    expect(assembled.serializedBytes).toBeLessThanOrEqual(
      PLAN_LIMITS.bytes.total,
    );
  });
});

describe("fill_session_activities assembly", () => {
  const SESSION_ID = "5d000000-0000-4000-8000-000000000001";
  const SESSION_DATE = "2026-08-12";

  function sessionDetail(
    overrides: Partial<SessionDetailRecords["session"]> = {},
  ): SessionDetailRecords {
    return {
      session: {
        id: SESSION_ID,
        localDate: SESSION_DATE,
        status: "active",
        title: "Lower body",
        sport: "Strength",
        intent: null,
        durationMinutes: 60,
        note: null,
        activities: [],
        ...overrides,
      },
      week: [],
      library: [],
      savedSessions: [],
      recentActuals: [],
    };
  }

  const FILL_COMPOSE: CoachAIComposeInput = {
    horizonStartDate: SESSION_DATE,
    horizonEndDate: SESSION_DATE,
    planningNote: null,
    regenerationFeedback: null,
    previousProposal: null,
    sessionId: SESSION_ID,
  };

  function fill(
    recordOverrides: Partial<CoachAIOwnedRecords> = {},
    composeOverrides: Partial<CoachAIComposeInput> = {},
  ) {
    return buildCoachAIContext(
      "fill_session_activities",
      records({ sessionDetail: sessionDetail(), ...recordOverrides }),
      { ...FILL_COMPOSE, ...composeOverrides },
    );
  }

  function logged(localDate: string): TrainingHistoryCompletion {
    return {
      localDate,
      status: "completed",
      title: "Run",
      sport: "Running",
      durationMinutes: 30,
      perceivedEffort: null,
      painReported: localDate === "2026-08-01",
      illnessReported: false,
      injuryReported: false,
      severeFatigueReported: false,
      note: null,
      replacementDescription: null,
      activityNames: [],
    };
  }

  it("reads the athlete, the setup and each goal's outcome, as the other calls do", () => {
    const assembled = fill({
      profile: {
        birthDate: "1992-03-14",
        gender: "male",
        heightCm: 182,
        latestWeightKg: 78,
        training: {
          sessionsPerWeek: 3,
          unavailableDays: [],
          availabilityNote: null,
          trainingPlaces: ["Home"],
          homeEquipment: ["Kettlebell", "Pull-up bar"],
        },
      },
    });

    expect(assembled.context.athlete).toMatchObject({
      gender: "male",
      heightCm: 182,
      weightKg: 78,
    });
    // What the call that writes exercises most needed and never had.
    expect(assembled.context.trainingSetup.homeEquipment).toEqual([
      "Kettlebell",
      "Pull-up bar",
    ]);
    expect(assembled.context.targetableGoals[0].desiredOutcome).toBe(
      "Finish strong on the climbs.",
    );
    expect(assembled.usage.training_setup).toBeGreaterThan(0);
    expect(assembled.serialized).not.toContain("1992-03-14");
  });

  it("carries the session and none of the long-range sources", () => {
    const assembled = fill({
      goals: [
        goal(),
        goal({
          id: "a1000000-0000-4000-8000-000000000002",
          status: "achieved",
        }),
      ],
    });

    expect(assembled.context.sessionDetail?.session.title).toBe("Lower body");
    expect(assembled.context.historicalGoals).toEqual([]);
    expect(assembled.context.roadmap).toBeNull();
    expect(assembled.context.planCommitments).toEqual([]);
    // Nothing of the roadmap's or the plan's part of ADR-023 reaches a fill.
    expect(assembled.serialized).not.toContain("currentRoadmap");
    expect(assembled.serialized).not.toContain("recurringSessions");
    expect(assembled.serialized).not.toContain("replaceHandle");
  });

  it("reads seven days of training, and the flags of four weeks (ADR-023 decision 15)", () => {
    // The log of 1 August carries a pain flag and is nine days back: outside
    // the seven days of history, inside the four weeks of flags.
    const assembled = fill({
      training: {
        ...EMPTY_TRAINING,
        completions: [
          logged("2026-08-09"),
          logged("2026-08-04"),
          logged("2026-08-01"),
        ],
      },
    });

    expect(assembled.context.recentSafetyFlags).toEqual([
      {
        localDate: "2026-08-01",
        painReported: true,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
      },
    ]);
    expect(assembled.context.recentSafetyFlagsWithheld).toBe(0);
    // Until this decision the flag did not reach a fill at all.
    expect(assembled.context.hasSafetySignal).toBe(true);
    // Only the day and the flags: nothing else of that log is sent.
    expect(assembled.serialized.match(/2026-08-01/g)).toHaveLength(1);

    expect(
      assembled.context.trainingHistory.completions.map(
        (entry) => entry.localDate,
      ),
    ).toEqual(["2026-08-09", "2026-08-04"]);
    // The window the coach is told about is the one it was sent: seven days
    // holding two sessions, not fifty-six days holding two, which would read
    // as a detraining gap nobody had.
    expect(assembled.context.trainingHistory).toMatchObject({
      windowStartDate: "2026-08-04",
      windowEndDate: TODAY,
      sessionsInWindow: 2,
      sessionsIncluded: 2,
      missedPlannedSessions: [],
    });
  });

  it.each([
    ["no session was read", { sessionDetail: null }, {}],
    [
      "the source read a different session",
      {},
      { sessionId: "5d000000-0000-4000-8000-000000000999" },
    ],
    [
      "the session was called off",
      { sessionDetail: sessionDetail({ status: "cancelled" }) },
      {},
    ],
    [
      "the session is already past",
      { sessionDetail: sessionDetail({ localDate: "2026-08-09" }) },
      { horizonStartDate: "2026-08-09", horizonEndDate: "2026-08-09" },
    ],
    [
      "the horizon is not the session's day",
      {},
      { horizonEndDate: "2026-08-13" },
    ],
    ["a regeneration is asked for", {}, { regenerationFeedback: "Different" }],
  ] as const)(
    "refuses when %s",
    (_label, recordOverrides, composeOverrides) => {
      expect(() =>
        fill(
          recordOverrides as Partial<CoachAIOwnedRecords>,
          composeOverrides as Partial<CoachAIComposeInput>,
        ),
      ).toThrow(CoachAIError);
    },
  );

  it("lets a flag older than four weeks go, and tells no other call of any", () => {
    const old = {
      ...logged("2026-08-01"),
      localDate: shiftDate(TODAY, -28),
    };
    const assembled = fill({
      training: { ...EMPTY_TRAINING, completions: [old] },
    });

    expect(assembled.context.recentSafetyFlags).toEqual([]);
    expect(assembled.context.hasSafetySignal).toBe(false);
    expect(build().serialized).not.toContain("recentSafetyFlags");
    expect(build().serialized).not.toContain("roadmapPhase");
  });

  it("counts the flagged days it leaves out past twenty", () => {
    const many = Array.from({ length: 23 }, (_, index) => ({
      ...logged("2026-08-01"),
      localDate: shiftDate(TODAY, -index),
    }));
    const assembled = fill({
      training: { ...EMPTY_TRAINING, completions: many },
    });

    expect(assembled.context.recentSafetyFlags).toHaveLength(20);
    expect(assembled.context.recentSafetyFlagsWithheld).toBe(3);
    // Newest first, so what is left out is the oldest.
    expect(assembled.context.recentSafetyFlags?.[0].localDate).toBe(TODAY);
    expect(assembled.usage.recent_safety_flags).toBeLessThanOrEqual(
      COACH_AI_CONTEXT_LIMITS.fill_session_activities.bytes.recentSafetyFlags,
    );
  });

  it("names the roadmap phase the session's day falls in, and only what it is for", () => {
    const phase = {
      title: "Base",
      focus: "Easy volume, twice a week of strength.",
      startDate: shiftDate(SESSION_DATE, -10),
      endDate: shiftDate(SESSION_DATE, 10),
      goalAttention: [
        {
          goalId: "a1000000-0000-4000-8000-000000000001",
          level: "primary" as const,
          reason: "REASON-THAT-MUST-NOT-TRAVEL",
        },
      ],
      milestones: [
        {
          title: "MILESTONE-THAT-MUST-NOT-TRAVEL",
          observableCriterion: "Run 10 km without stopping.",
          targetDate: SESSION_DATE,
          goalIds: ["a1000000-0000-4000-8000-000000000001"],
        },
      ],
    };
    const roadmapVersion = {
      id: "b1000000-0000-4000-8000-000000000001",
      versionNumber: 2,
      content: {
        schemaVersion: "fittip.roadmap.v2" as const,
        title: "Autumn build",
        summary: "SUMMARY-THAT-MUST-NOT-TRAVEL",
        startDate: phase.startDate,
        endDate: shiftDate(SESSION_DATE, 60),
        phases: [
          phase,
          {
            ...phase,
            title: "Build",
            focus: "LATER-FOCUS-THAT-MUST-NOT-TRAVEL",
            startDate: shiftDate(SESSION_DATE, 11),
            endDate: shiftDate(SESSION_DATE, 60),
          },
        ],
        reviewPoints: [],
      },
    };
    const assembled = fill({ roadmapVersion });

    expect(assembled.context.roadmapPhase).toEqual({
      title: "Base",
      focus: "Easy volume, twice a week of strength.",
      startDate: phase.startDate,
      endDate: phase.endDate,
    });
    expect(assembled.serialized).not.toMatch(/MUST-NOT-TRAVEL/);
    // The plan's reduction is not a fill's, and nothing is recorded as lineage.
    expect(assembled.context.roadmap).toBeNull();
    expect(assembled.references.roadmapVersion).toBeNull();
    expect(fill().context.roadmapPhase).toBeNull();
  });

  it("holds every part of a fill request inside its total", () => {
    const bytes = COACH_AI_CONTEXT_LIMITS.fill_session_activities.bytes;
    const sumOfParts =
      bytes.athlete +
      bytes.trainingSetup +
      bytes.targetableGoals +
      bytes.historicalGoals +
      bytes.memory +
      bytes.trainingHistory +
      bytes.planningNote +
      bytes.roadmapPhase +
      bytes.recentSafetyFlags +
      bytes.sessionDetail;

    expect(sumOfParts + 1_000).toBeLessThanOrEqual(bytes.total);
  });

  it("refuses a session id on any other operation", () => {
    expect(() => build({}, { sessionId: SESSION_ID })).toThrow(CoachAIError);
  });

  it("keeps a whole worst-case context inside the operation's total", () => {
    const limits = COACH_AI_CONTEXT_LIMITS.fill_session_activities;
    // Every part at its allocation: the sum of the parts plus the envelope is
    // what `total` must hold, or the whole-context refusal becomes reachable.
    const sumOfParts =
      limits.bytes.athlete +
      limits.bytes.trainingSetup +
      limits.bytes.targetableGoals +
      limits.bytes.memory +
      limits.bytes.trainingHistory +
      limits.bytes.planningNote +
      limits.bytes.sessionDetail;
    expect(sumOfParts).toBeLessThan(limits.bytes.total);
    expect(byteLength("")).toBe(0);
  });
});
