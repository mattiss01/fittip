import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
  createRoadmapMock,
  createLibraryMock,
  createSavedSessionsMock,
} = vi.hoisted(() => ({
  createLibraryMock: vi.fn(),
  createSavedSessionsMock: vi.fn(),
  createProfileMock: vi.fn(),
  createGoalMock: vi.fn(),
  createMemoryMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  createRollingPlanMock: vi.fn(),
  createRoadmapMock: vi.fn(),
}));

vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/goal-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/goal-repository")>();
  return { ...actual, createGoalRepository: createGoalMock };
});
vi.mock("@/server/repositories/memory-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/memory-repository")>();
  return { ...actual, createMemoryRepository: createMemoryMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createRollingPlanMock };
});
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});

vi.mock(
  "@/server/repositories/personal-activity-repository",
  async (original) => {
    const actual =
      await original<
        typeof import("@/server/repositories/personal-activity-repository")
      >();
    return { ...actual, createPersonalActivityLibrary: createLibraryMock };
  },
);
vi.mock("@/server/repositories/saved-session-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/saved-session-repository")
    >();
  return { ...actual, createSavedSessionLibrary: createSavedSessionsMock };
});

import {
  buildCoachAIContext,
  CoachAIContextBelowMinimumError,
  type CoachAIGoalRecord,
} from "@/server/ai/context";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { Completion } from "@/server/completions/completion-log";
import { OwnedRecordsCoachAIContextSource } from "@/server/context/coach-ai-context-source";
import type { MemoryItemView } from "@/server/memory/memory-records";
import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";
import { TRAINING_HISTORY_WINDOW_DAYS } from "@/server/training/training-history-context";

const OWNER_ID = "53000000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;
const OTHER_OWNER_ID = "53000000-0000-4000-8000-000000000002";
const TIMEZONE = "Europe/Berlin";
/** 09:00 UTC is the same calendar day in Berlin, so today is unambiguous. */
const NOW = new Date("2026-08-04T09:00:00.000Z");
const TODAY = "2026-08-04";
const WINDOW_START = "2026-06-10";
const HORIZON_END = "2026-09-01";

const listGoals = vi.fn();
const listMemory = vi.fn();
const listCompletions = vi.fn();
const getPlanSlice = vi.fn();
const getCurrentVersion = vi.fn();
const materializeSeries = vi.fn();
const listSeries = vi.fn();
const listLibrary = vi.fn();
const listSavedSessions = vi.fn();

const COMPOSE = {
  horizonStartDate: TODAY,
  horizonEndDate: HORIZON_END,
  planningNote: null,
  regenerationFeedback: null,
  previousProposal: null,
};

describe("the production coaching context source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileIs({ timezoneName: TIMEZONE });
    listGoals.mockResolvedValue({ revision: 7, goals: [goal()] });
    listMemory.mockResolvedValue({
      revision: 4,
      today: TODAY,
      items: [memoryItem()],
    });
    listCompletions.mockResolvedValue([]);
    getPlanSlice.mockResolvedValue({
      planId: "44000000-0000-4000-8000-000000000001",
      revision: 12,
      sessions: [],
      recoveryDates: [],
    });
    materializeSeries.mockResolvedValue({ createdCount: 0, skipped: [] });
    listSeries.mockResolvedValue([]);
    createGoalMock.mockResolvedValue({ list: listGoals });
    createMemoryMock.mockResolvedValue({ list: listMemory });
    createCompletionLogMock.mockResolvedValue({ list: listCompletions });
    createRollingPlanMock.mockResolvedValue({
      getPlanSlice,
      materializeSeries,
      listSeries,
    });
    getCurrentVersion.mockResolvedValue(null);
    createRoadmapMock.mockResolvedValue({ getCurrentVersion });
    listLibrary.mockResolvedValue([]);
    listSavedSessions.mockResolvedValue([]);
    createLibraryMock.mockResolvedValue({ list: listLibrary });
    createSavedSessionsMock.mockResolvedValue({ list: listSavedSessions });
  });

  describe("for fill_session_activities (A7-2)", () => {
    const SESSION_ID = "66000000-0000-4000-8000-0000000000f1";

    function fillSource(sessionId: string | null = SESSION_ID) {
      return new OwnedRecordsCoachAIContextSource({
        operation: "fill_session_activities",
        clock: () => NOW,
        sessionId,
      });
    }

    it("is built with a session and only this operation is", () => {
      expect(() => fillSource(null)).toThrow();
      expect(
        () =>
          new OwnedRecordsCoachAIContextSource({
            operation: "create_seven_day_plan",
            sessionId: SESSION_ID,
          }),
      ).toThrow();
    });

    it("reads the library and saved sessions, and selects the session from the plan window", async () => {
      getPlanSlice.mockResolvedValue({
        planId: "44000000-0000-4000-8000-000000000001",
        revision: 12,
        sessions: [
          planSession({
            id: SESSION_ID,
            localDate: "2026-08-06",
            title: "Lower body",
            sport: "Strength",
          }),
        ],
        recoveryDates: [],
      });
      listLibrary.mockResolvedValue([
        {
          id: "5d000000-0000-4000-8000-0000000000a1",
          name: "Back squat",
          sport: "Strength",
          measurementMode: "sets_reps_load",
          instructions: "Owner-written cue that stays behind",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ]);

      const records = await fillSource().load(OWNER);

      expect(listLibrary).toHaveBeenCalledOnce();
      expect(listSavedSessions).toHaveBeenCalledOnce();
      // ADR-023 decision 14: a fill reads the roadmap for the phase its day
      // falls in. Assembly takes that one phase's title, focus and dates.
      expect(getCurrentVersion).toHaveBeenCalledOnce();
      // Decision 18: six months of logs are read for last results. What goes
      // on as training history is still ADR-013's eight weeks of them.
      expect(listCompletions).toHaveBeenCalledWith(shift(TODAY, -182), TODAY);
      expect(records.sessionDetail?.session.title).toBe("Lower body");
      expect(records.sessionDetail?.library).toEqual([
        {
          id: "5d000000-0000-4000-8000-0000000000a1",
          name: "Back squat",
          sport: "Strength",
          measurementMode: "sets_reps_load",
        },
      ]);
    });

    it("keeps a log older than eight weeks out of the training history it hands on", async () => {
      // Read for last results (decision 18), but ADR-013's window is still
      // what the history and the flags are drawn from. A log that old is a
      // recorded source only if it supplied a result, through the session
      // detail's own sources.
      listCompletions.mockResolvedValue([
        completion(),
        completion({
          id: "75000000-0000-4000-8000-0000000000aa",
          actualLocalDate: shift(TODAY, -100),
          painReported: true,
        }),
      ]);

      const records = await fillSource().load(OWNER);

      expect(
        records.training.completions.map((entry) => entry.localDate),
      ).toEqual(["2026-08-03"]);
    });

    it("records a log whose flag a fill is sent as a source, though it is older than a week", async () => {
      const flaggedId = "75000000-0000-4000-8000-0000000000bb";
      listCompletions.mockResolvedValue([
        completion(),
        completion({
          id: flaggedId,
          actualLocalDate: shift(TODAY, -10),
          painReported: true,
        }),
        // Unflagged and older than a week: neither sent nor a source.
        completion({
          id: "75000000-0000-4000-8000-0000000000cc",
          actualLocalDate: shift(TODAY, -12),
        }),
      ]);

      const records = await fillSource().load(OWNER);

      // What was sent is what is named, the flag's log included.
      expect(records.sources?.map((source) => source.recordId)).toEqual([
        "75000000-0000-4000-8000-000000000001",
        flaggedId,
      ]);
    });

    it("hands assembly no session when the id is not in the owner's window", async () => {
      const records = await fillSource().load(OWNER);

      expect(records.sessionDetail).toBeNull();
    });
  });

  it("reads no library and no saved sessions for the plan or the roadmap", async () => {
    await source("create_seven_day_plan").load(OWNER);
    await source("create_roadmap").load(OWNER);

    expect(listLibrary).not.toHaveBeenCalled();
    expect(listSavedSessions).not.toHaveBeenCalled();
  });

  it("refuses an owner with no confirmed zone rather than defaulting to the server's", async () => {
    profileIs({ timezoneName: null });

    await expect(source().load(OWNER)).rejects.toThrow(
      CoachAIContextBelowMinimumError,
    );
    await expect(source().load(OWNER)).rejects.toMatchObject({
      code: "context_below_minimum",
      missing: ["resolved_timezone"],
    });

    // Nothing else was read, so no window was derived in any zone at all.
    expect(listGoals).not.toHaveBeenCalled();
    expect(listCompletions).not.toHaveBeenCalled();
    expect(getPlanSlice).not.toHaveBeenCalled();
  });

  it("refuses when the profile it read is not the owner it was asked about", async () => {
    // The two ids derive from the same verified session, so this cannot happen
    // without something upstream deriving identity twice and differently. The
    // point of the test is that the refusal is reachable at all: while `ownerId`
    // was the caller's own value echoed back, neither this check nor the
    // service's `records.ownerId !== owner.id` guard could ever have fired.
    profileIs({ timezoneName: TIMEZONE, userId: OTHER_OWNER_ID });

    await expect(source().load(OWNER)).rejects.toMatchObject({
      code: "owner_denied",
    });
    expect(listGoals).not.toHaveBeenCalled();
    expect(listCompletions).not.toHaveBeenCalled();
    expect(getPlanSlice).not.toHaveBeenCalled();
  });

  it("hands assembly the profile fields ADR-023 names and no others", async () => {
    profileIs({ timezoneName: "Europe/Berlin" });

    const records = await source().load(OWNER);

    expect(records.profile).toEqual({
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
    });
    expect(JSON.stringify(records.profile)).not.toMatch(/MUST-NOT-TRAVEL/);
  });

  it("refuses an owner with no profile row at all", async () => {
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue(null),
    });

    await expect(source().load(OWNER)).rejects.toThrow(
      CoachAIContextBelowMinimumError,
    );
  });

  it("derives every window from owner-local today", async () => {
    const records = await source().load(OWNER);

    expect(records.today).toBe(TODAY);
    expect(records.timezoneName).toBe(TIMEZONE);
    expect(records.ownerId).toBe(OWNER_ID);
    expect(records.goalCollectionRevision).toBe(7);
    expect(records.memoryCollectionRevision).toBe(4);

    // The eligibility window is the accepted 56 owner-local days ending today.
    expect(listCompletions).toHaveBeenCalledWith(WINDOW_START, TODAY);
    expect(listMemory).toHaveBeenCalledWith(TODAY);
    expect(TRAINING_HISTORY_WINDOW_DAYS).toBe(56);

    // The plan read reaches far enough forward for every commitment ADR-013
    // decision 5 admits, and back far enough for the miss list.
    expect(getPlanSlice).toHaveBeenCalledWith(WINDOW_START, "2027-01-31");
  });

  it("tops the plan window up before reading it, per ADR-017 consequence 3", async () => {
    await source().load(OWNER);

    expect(materializeSeries).toHaveBeenCalledTimes(1);
    // The revision it was handed is the one the slice it read reported.
    expect(materializeSeries.mock.calls[0]?.[1]).toBe(12);
  });

  it("copies only allowlisted completion fields, whatever else the record carries", async () => {
    const record = completion({ id: "75000000-0000-4000-8000-000000000001" });
    // Acceptance criterion 2: a field outside the allowlist, added to a real
    // completion, must not be able to reach a provider payload. `actualStartedAt`
    // is a genuine column deliberately left out on 14 September 2026; the other
    // two stand in for whatever the schema gains next.
    Object.assign(record, {
      actualStartedAt: "2026-08-03T05:30:00.000Z",
      clinicalNote: "NOT-ALLOWLISTED-CLINICAL-NOTE",
      heartRateAverage: 148,
    });
    listCompletions.mockResolvedValue([record]);

    const records = await source().load(OWNER);

    expect(records.training.completions).toEqual([
      {
        localDate: "2026-08-03",
        status: "completed",
        title: "Aerobic run",
        sport: "Running",
        durationMinutes: 58,
        perceivedEffort: 6,
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        note: "Legs came round after twenty minutes.",
        replacementDescription: null,
        activityNames: ["Easy running"],
      },
    ]);

    // The payload, not just the intermediate record: this is what a provider
    // would be sent.
    const serialized = buildCoachAIContext(
      "create_roadmap",
      records,
      COMPOSE,
    ).serialized;
    for (const forbidden of [
      "actualStartedAt",
      "2026-08-03T05:30:00.000Z",
      "clinicalNote",
      "NOT-ALLOWLISTED-CLINICAL-NOTE",
      "heartRateAverage",
      "148",
      "timezoneName",
      "planSessionId",
      "updatedAt",
      "plannedSnapshot",
      record.id,
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it("reports an unplanned completion with no planned title or sport", async () => {
    listCompletions.mockResolvedValue([
      completion({
        status: "unplanned",
        planSessionId: null,
        plannedSnapshot: null,
        note: undefined,
        durationMinutes: undefined,
        perceivedEffort: undefined,
      }),
    ]);

    expect((await source().load(OWNER)).training.completions[0]).toMatchObject({
      status: "unplanned",
      title: null,
      sport: null,
      note: null,
      durationMinutes: null,
      perceivedEffort: null,
      activityNames: ["Easy running"],
    });
  });

  it("marks a planned session complete only when a completion references it", async () => {
    const planSessionId = "66000000-0000-4000-8000-000000000001";
    listCompletions.mockResolvedValue([completion({ planSessionId })]);
    getPlanSlice.mockResolvedValue({
      planId: "44000000-0000-4000-8000-000000000001",
      revision: 12,
      sessions: [
        planSession({ id: planSessionId, localDate: "2026-08-03" }),
        planSession({
          id: "66000000-0000-4000-8000-000000000002",
          localDate: "2026-08-02",
          title: "Missed tempo",
        }),
        // Called off rather than missed, so it is neither a commitment nor a
        // miss and must not appear at all.
        planSession({
          id: "66000000-0000-4000-8000-000000000003",
          localDate: "2026-08-01",
          status: "cancelled",
        }),
      ],
      recoveryDates: [],
    });

    const records = await source().load(OWNER);

    // The id and the minutes are for assembly: the id is never sent, and the
    // minutes only on a session inside a plan's chosen days (ADR-024).
    expect(records.training.plannedSessions).toEqual([
      {
        id: expect.any(String),
        localDate: "2026-08-03",
        title: "Aerobic run",
        sport: "Running",
        durationMinutes: expect.toBeOneOf([expect.any(Number), null]),
        hasCompletion: true,
        ruleSeriesId: null,
      },
      {
        id: expect.any(String),
        localDate: "2026-08-02",
        title: "Missed tempo",
        sport: "Running",
        durationMinutes: expect.toBeOneOf([expect.any(Number), null]),
        hasCompletion: false,
        ruleSeriesId: null,
      },
    ]);

    const assembled = buildCoachAIContext("create_roadmap", records, COMPOSE);
    expect(assembled.context.trainingHistory.missedPlannedSessions).toEqual([
      { localDate: "2026-08-02", title: "Missed tempo", sport: "Running" },
    ]);
  });

  describe("recurring series (ADR-013 decision 5, amended 2 October 2026)", () => {
    const SERIES_ID = "77000000-0000-4000-8000-000000000001";
    const storedSeries = {
      id: SERIES_ID,
      predecessorSeriesId: null,
      frequency: "weekly" as const,
      intervalCount: 1,
      weekdays: [1, 4] as (1 | 4)[],
      startDate: "2026-07-06",
      title: "Club run",
      sport: "Running",
      intent: "Private intent text",
      expectedDurationMinutes: 50,
      note: "Private series note",
      activities: [
        {
          position: 0,
          name: "Private activity name",
          sport: "Running",
          measurementMode: "duration" as const,
        },
      ],
    };

    it("reads the series for a roadmap and hands over only the rule, title and sport", async () => {
      listSeries.mockResolvedValue([storedSeries]);

      const records = await source().load(OWNER);

      expect(listSeries).toHaveBeenCalledTimes(1);
      expect(records.training.series).toEqual([
        {
          id: SERIES_ID,
          title: "Club run",
          sport: "Running",
          durationMinutes: expect.toBeOneOf([expect.any(Number), null]),
          frequency: "weekly",
          intervalCount: 1,
          weekdays: [1, 4],
          startDate: "2026-07-06",
          endDate: null,
        },
      ]);

      const assembled = buildCoachAIContext("create_roadmap", records, COMPOSE);
      expect(assembled.context.recurringSessions).toEqual([
        {
          title: "Club run",
          sport: "Running",
          durationMinutes: expect.toBeOneOf([expect.any(Number), null]),
          frequency: "weekly",
          intervalCount: 1,
          weekdays: ["Monday", "Thursday"],
          startDate: "2026-07-06",
          endDate: null,
        },
      ]);
      // Nothing else of the template can reach a provider.
      expect(assembled.serialized).not.toContain("Private");
      expect(assembled.serialized).not.toContain(SERIES_ID);
    });

    it("does not read the series at all for the seven-day plan", async () => {
      listSeries.mockResolvedValue([storedSeries]);

      const records = await source("create_seven_day_plan").load(OWNER);

      expect(listSeries).not.toHaveBeenCalled();
      expect(records.training.series).toEqual([]);
    });

    it("does not read the series for a fill either", async () => {
      listSeries.mockResolvedValue([storedSeries]);

      const records = await new OwnedRecordsCoachAIContextSource({
        operation: "fill_session_activities",
        clock: () => NOW,
        sessionId: "66000000-0000-4000-8000-0000000000f1",
      }).load(OWNER);

      expect(listSeries).not.toHaveBeenCalled();
      expect(records.training.series).toEqual([]);
    });

    it("says an occurrence follows its rule only while it is untouched and on its date", async () => {
      const occurrence = {
        seriesId: SERIES_ID,
        occurrenceDate: "2026-08-13",
        localDate: "2026-08-13",
      };
      getPlanSlice.mockResolvedValue({
        planId: "44000000-0000-4000-8000-000000000001",
        revision: 12,
        sessions: [
          planSession({
            ...occurrence,
            id: "66000000-0000-4000-8000-00000000000a",
          }),
          planSession({
            ...occurrence,
            id: "66000000-0000-4000-8000-00000000000b",
            hasDiverged: true,
          }),
          planSession({
            ...occurrence,
            id: "66000000-0000-4000-8000-00000000000c",
            localDate: "2026-08-14",
          }),
          planSession({
            id: "66000000-0000-4000-8000-00000000000d",
            localDate: "2026-08-15",
          }),
        ],
        recoveryDates: [],
      });

      const records = await source().load(OWNER);

      expect(
        records.training.plannedSessions.map((entry) => entry.ruleSeriesId),
      ).toEqual([SERIES_ID, null, null, null]);
    });
  });

  it("records as sources only the completions the coach is actually sent", async () => {
    // One more than the accepted session cap, so exactly one is read past.
    const records = Array.from({ length: 21 }, (_, index) =>
      completion({
        id: `75000000-0000-4000-8000-0000000000${(index + 16).toString(16)}`,
        actualLocalDate: shift(TODAY, -index),
        revision: index,
      }),
    );
    listCompletions.mockResolvedValue(records);

    const loaded = await source().load(OWNER);

    expect(loaded.training.completions).toHaveLength(21);
    expect(loaded.sources).toHaveLength(20);
    // Newest first, so the one left out is the oldest — and it is the same one
    // assembly leaves out, which is what makes the source list exact.
    expect(loaded.sources).toEqual(
      records.slice(0, 20).map((record) => ({
        kind: "completion",
        recordId: record.id,
        revisionNumber: record.revision,
      })),
    );

    const assembled = buildCoachAIContext("create_roadmap", loaded, COMPOSE);
    expect(assembled.context.trainingHistory.sessionsIncluded).toBe(20);
    // Trimming stays disclosed rather than silent.
    expect(assembled.context.trainingHistory.sessionsInWindow).toBe(21);
    expect(
      assembled.context.trainingHistory.completions.map(
        (entry) => entry.localDate,
      ),
    ).not.toContain(records[20]?.actualLocalDate);
  });

  it("names fewer sources for the plan operation, whose byte budget is smaller", async () => {
    // 9,700 bytes against the roadmap's 10,200 since ADR-023: one log apart
    // when each is as long as a note allows.
    const long = "x".repeat(400);
    const records = Array.from({ length: 20 }, (_, index) =>
      completion({
        id: `75000000-0000-4000-8000-0000000000${(index + 16).toString(16)}`,
        actualLocalDate: shift(TODAY, -index),
        note: long,
      }),
    );
    listCompletions.mockResolvedValue(records);

    const roadmap = await source("create_roadmap").load(OWNER);
    const plan = await source("create_seven_day_plan").load(OWNER);

    expect(roadmap.sources?.length).toBeGreaterThan(plan.sources?.length ?? 0);
    // Each still matches what its own operation's assembly transmits.
    for (const [operation, loaded] of [
      ["create_roadmap", roadmap],
      ["create_seven_day_plan", plan],
    ] as const) {
      expect(
        buildCoachAIContext(operation, loaded, COMPOSE).context.trainingHistory
          .sessionsIncluded,
      ).toBe(loaded.sources?.length);
    }
  });

  it("passes the goals and memory the repositories returned straight to assembly", async () => {
    const records = await source().load(OWNER);
    const assembled = buildCoachAIContext("create_roadmap", records, COMPOSE);

    expect(assembled.context.targetableGoals).toEqual([
      {
        id: goal().id,
        title: goal().title,
        desiredOutcome: goal().desiredOutcome,
        sports: goal().sports,
        priorityTier: goal().priorityTier,
        targetDate: goal().targetDate,
      },
    ]);
    expect(assembled.context.memory).toEqual([
      {
        id: memoryItem().id,
        memoryType: "constraint",
        content: memoryItem().content,
      },
    ]);
  });
});

function source(
  operation: "create_roadmap" | "create_seven_day_plan" = "create_roadmap",
) {
  return new OwnedRecordsCoachAIContextSource({
    operation,
    clock: () => NOW,
  });
}

function profileIs(profile: { timezoneName: string | null; userId?: string }) {
  createProfileMock.mockResolvedValue({
    getCurrentProfile: vi.fn().mockResolvedValue({
      userId: OWNER_ID,
      createdAt: "2026-01-05T09:00:00.000Z",
      ...profile,
    }),
    getDetails: vi.fn().mockResolvedValue(PROFILE_DETAILS),
  });
}

/** Everything the profile read returns, including what must stay behind. */
const PROFILE_DETAILS = {
  displayName: "NAME-THAT-MUST-NOT-TRAVEL",
  birthDate: "1992-03-14",
  gender: "female",
  unitsSystem: "metric",
  heightCm: 171,
  timezoneName: "Europe/Berlin",
  sports: ["SPORTS-LIST-THAT-MUST-NOT-TRAVEL"],
  latestWeightKg: 64.5,
  training: {
    sessionsPerWeek: 4,
    unavailableDays: ["sunday"],
    availabilityNote: "Late on Thursdays.",
    trainingPlaces: ["Home", "Gym"],
    homeEquipment: ["Kettlebell"],
  },
  setup: { step: null, finishedAt: "2026-01-05T09:00:00.000Z" },
};

function completion(overrides: Partial<Completion> = {}): Completion {
  return {
    id: "75000000-0000-4000-8000-000000000001",
    planSessionId: "66000000-0000-4000-8000-000000000001",
    status: "completed",
    actualLocalDate: "2026-08-03",
    timezoneName: TIMEZONE,
    title: null,
    sport: null,
    replacedBy: null,
    replaces: [],
    durationMinutes: 58,
    perceivedEffort: 6,
    note: "Legs came round after twenty minutes.",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: {
      localDate: "2026-08-03",
      position: 0,
      title: "Aerobic run",
      sport: "Running",
      status: "active",
      seriesId: null,
      occurrenceDate: null,
      activities: [],
    },
    revision: 2,
    activities: [
      {
        position: 0,
        name: "Easy running",
        sport: "Running",
        measurementMode: "duration_intensity",
      },
    ],
    updatedAt: "2026-08-03T18:00:00.000Z",
    ...overrides,
  };
}

function planSession(
  overrides: Partial<RollingPlanSession> = {},
): RollingPlanSession {
  return {
    id: "66000000-0000-4000-8000-000000000001",
    localDate: "2026-08-03",
    position: 0,
    title: "Aerobic run",
    sport: "Running",
    status: "active",
    cancelledAt: null,
    seriesId: null,
    occurrenceDate: null,
    hasDiverged: false,
    activities: [],
    ...overrides,
  };
}

function goal(): CoachAIGoalRecord {
  return {
    id: "c1000000-0000-4000-8000-000000000001",
    title: "Run a hilly half marathon",
    desiredOutcome: "Finish strong on the climbs.",
    sports: ["Running"],
    priorityTier: "core",
    targetDate: "2026-11-15",
    status: "active",
  };
}

function memoryItem(): MemoryItemView {
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
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    history: [],
  };
}

function shift(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
