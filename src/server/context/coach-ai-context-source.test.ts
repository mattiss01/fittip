import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
  createRoadmapMock,
} = vi.hoisted(() => ({
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
    createGoalMock.mockResolvedValue({ list: listGoals });
    createMemoryMock.mockResolvedValue({ list: listMemory });
    createCompletionLogMock.mockResolvedValue({ list: listCompletions });
    createRollingPlanMock.mockResolvedValue({
      getPlanSlice,
      materializeSeries,
    });
    getCurrentVersion.mockResolvedValue(null);
    createRoadmapMock.mockResolvedValue({ getCurrentVersion });
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

    // The plan read reaches far enough forward for every locked commitment
    // ADR-013 decision 5 admits, and back far enough for the miss list.
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
        feeling: "good",
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
        feeling: undefined,
      }),
    ]);

    expect((await source().load(OWNER)).training.completions[0]).toMatchObject({
      status: "unplanned",
      title: null,
      sport: null,
      note: null,
      durationMinutes: null,
      perceivedEffort: null,
      feeling: null,
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

    expect(records.training.plannedSessions).toEqual([
      {
        localDate: "2026-08-03",
        title: "Aerobic run",
        sport: "Running",
        isLocked: false,
        hasCompletion: true,
      },
      {
        localDate: "2026-08-02",
        title: "Missed tempo",
        sport: "Running",
        isLocked: false,
        hasCompletion: false,
      },
    ]);

    const assembled = buildCoachAIContext("create_roadmap", records, COMPOSE);
    expect(assembled.context.trainingHistory.missedPlannedSessions).toEqual([
      { localDate: "2026-08-02", title: "Missed tempo", sport: "Running" },
    ]);
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
    const long = "x".repeat(390);
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
        category: goal().category,
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
  });
}

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
    durationMinutes: 58,
    perceivedEffort: 6,
    feeling: "good",
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
      isLocked: false,
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
    isLocked: false,
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
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-11-15",
    status: "active",
    archivedAt: null,
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
