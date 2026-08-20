import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLibraryMock,
  createPlanMock,
  createProfileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createLibraryMock: vi.fn(),
  createPlanMock: vi.fn(),
  createProfileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/saved-session-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/saved-session-repository")
    >();
  return { ...actual, createSavedSessionLibrary: createLibraryMock };
});
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createPlanMock };
});
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});

import {
  INITIAL_LIBRARY_ACTION_STATE,
  INITIAL_LIBRARY_SAVE_ACTION_STATE,
} from "./action-state";
import { changeLibraryAction, saveSessionToLibraryAction } from "./actions";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import {
  RollingPlanRuleError,
  type RollingPlanChangeSet,
} from "@/server/rolling-plan/rolling-plan";
import {
  SavedSessionConflictError,
  type SavedSessionChange,
} from "@/server/saved-sessions/saved-sessions";

const TIMEZONE = "Europe/Berlin";
const PLAN_SESSION_ID = "7e000000-0000-4000-8000-000000000001";
const SAVED_ID = "7e000000-0000-4000-8000-000000000002";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

describe("saved session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "u",
        createdAt: "",
        timezoneName: TIMEZONE,
      }),
    });
  });

  it("saves a planned session by value and leaves the plan untouched", async () => {
    const applyChange = vi.fn().mockResolvedValue({ result: "created" });
    const applyChangeSet = vi.fn();
    createLibraryMock.mockResolvedValue({ applyChange, get: vi.fn() });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    await expect(
      saveSessionToLibraryAction(
        INITIAL_LIBRARY_SAVE_ACTION_STATE,
        form({ sessionId: PLAN_SESSION_ID, name: "  Tuesday tempo  " }),
      ),
    ).resolves.toMatchObject({
      status: "saved",
      message: "Saved to your library.",
    });

    const [change] = applyChange.mock.calls[0] as [SavedSessionChange];
    expect(change).toEqual({
      operation: "create",
      session: {
        name: "Tuesday tempo",
        title: "Aerobic run",
        sport: "Running",
        expectedDurationMinutes: 60,
        activities: [
          {
            position: 0,
            name: "Easy running",
            sport: "Running",
            measurementMode: "duration_intensity",
          },
        ],
      },
    });
    // Saving is not a plan change, so nothing reaches the plan's change set.
    expect(applyChangeSet).not.toHaveBeenCalled();
    expect(revalidatePathMock.mock.calls).toEqual([["/home/plan/saved"]]);
  });

  it("refuses to save a session the owner's own plan does not hold", async () => {
    createLibraryMock.mockResolvedValue({ applyChange: vi.fn() });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
    });

    await expect(
      saveSessionToLibraryAction(
        INITIAL_LIBRARY_SAVE_ACTION_STATE,
        form({
          sessionId: "7e000000-0000-4000-8000-0000000000ff",
          name: "Borrowed",
        }),
      ),
    ).resolves.toMatchObject({ status: "validation", name: "Borrowed" });
  });

  it("reuses an entry as a plain addition on the date the owner picked", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({
      result: "applied",
      planRevision: 2,
    });
    const materializeSeries = vi.fn().mockResolvedValue({
      planRevision: 2,
      createdCount: 0,
      skipped: [],
    });
    createLibraryMock.mockResolvedValue({
      get: vi.fn().mockResolvedValue(savedSession()),
      applyChange: vi.fn(),
    });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
      materializeSeries,
    });

    await expect(
      changeLibraryAction(
        INITIAL_LIBRARY_ACTION_STATE,
        form({
          operation: "reuse",
          savedSessionId: SAVED_ID,
          localDate: today(),
        }),
      ),
    ).resolves.toMatchObject({
      status: "saved",
      message: "Added to your plan.",
    });

    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.changes).toEqual([
      expect.objectContaining({
        operation: "add",
        session: expect.objectContaining({
          title: "Tempo run",
          sport: "Running",
          localDate: today(),
          // Position 0 is taken, so the copy lands in the first free slot.
          position: 1,
          isLocked: false,
        }),
      }),
    ]);
    expect(materializeSeries).toHaveBeenCalledWith(expect.any(String), 2);
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/home/plan"],
      ["/home/plan/saved"],
    ]);
  });

  it("reports the plan's own rules honestly when a reuse breaks one", async () => {
    createLibraryMock.mockResolvedValue({
      get: vi.fn().mockResolvedValue(savedSession()),
    });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet: vi
        .fn()
        .mockRejectedValue(new RollingPlanRuleError("daily-session-limit")),
    });

    await expect(
      changeLibraryAction(
        INITIAL_LIBRARY_ACTION_STATE,
        form({
          operation: "reuse",
          savedSessionId: SAVED_ID,
          localDate: today(),
        }),
      ),
    ).resolves.toMatchObject({
      status: "rule",
      conflict: "daily-session-limit",
    });
  });

  it("refuses a reuse onto a date outside the plan window", async () => {
    createLibraryMock.mockResolvedValue({ get: vi.fn() });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet: vi.fn(),
    });

    for (const localDate of [
      shiftIsoDate(today(), -1),
      shiftIsoDate(today(), 14),
    ]) {
      await expect(
        changeLibraryAction(
          INITIAL_LIBRARY_ACTION_STATE,
          form({ operation: "reuse", savedSessionId: SAVED_ID, localDate }),
        ),
      ).resolves.toMatchObject({ status: "validation" });
    }
  });

  it("edits an entry at the revision the surface read", async () => {
    const applyChange = vi.fn().mockResolvedValue({ result: "updated" });
    createLibraryMock.mockResolvedValue({ applyChange });

    const result = await changeLibraryAction(
      INITIAL_LIBRARY_ACTION_STATE,
      form({
        operation: "edit",
        savedSessionId: SAVED_ID,
        expectedRevision: "3",
        name: "Tuesday tempo",
        title: "Longer tempo run",
        sport: "Running",
        expectedDurationMinutes: "80",
      }),
    );

    expect(result).toMatchObject({ status: "saved", draft: undefined });
    expect(applyChange.mock.calls[0][0]).toEqual({
      operation: "edit",
      savedSessionId: SAVED_ID,
      expectedRevision: 3,
      session: {
        name: "Tuesday tempo",
        title: "Longer tempo run",
        sport: "Running",
        expectedDurationMinutes: 80,
      },
    });
  });

  it("returns the refused draft and says the record changed", async () => {
    createLibraryMock.mockResolvedValue({
      applyChange: vi.fn().mockRejectedValue(new SavedSessionConflictError()),
    });

    await expect(
      changeLibraryAction(
        INITIAL_LIBRARY_ACTION_STATE,
        form({
          operation: "edit",
          savedSessionId: SAVED_ID,
          expectedRevision: "0",
          name: "Renamed",
          title: "Tempo run",
          sport: "Running",
        }),
      ),
    ).resolves.toMatchObject({
      status: "conflict",
      conflict: "stale",
      draft: expect.objectContaining({ name: "Renamed" }),
    });
  });

  it("deletes at the revision the surface read and says it is permanent", async () => {
    const applyChange = vi.fn().mockResolvedValue({ result: "deleted" });
    createLibraryMock.mockResolvedValue({ applyChange });

    await expect(
      changeLibraryAction(
        INITIAL_LIBRARY_ACTION_STATE,
        form({
          operation: "delete",
          savedSessionId: SAVED_ID,
          expectedRevision: "2",
        }),
      ),
    ).resolves.toMatchObject({
      status: "saved",
      message: "Saved session deleted.",
    });
    expect(applyChange.mock.calls[0][0]).toEqual({
      operation: "delete",
      savedSessionId: SAVED_ID,
      expectedRevision: 2,
    });
  });

  it("refuses an operation this surface does not offer", async () => {
    createLibraryMock.mockResolvedValue({ applyChange: vi.fn() });
    await expect(
      changeLibraryAction(
        INITIAL_LIBRARY_ACTION_STATE,
        form({ operation: "create", savedSessionId: SAVED_ID }),
      ),
    ).resolves.toMatchObject({ status: "validation" });
  });
});

function slice() {
  return {
    planId: "7e000000-0000-4000-8000-0000000000a1",
    revision: 0,
    recoveryDates: [],
    sessions: [
      {
        id: PLAN_SESSION_ID,
        localDate: today(),
        position: 0,
        title: "Aerobic run",
        sport: "Running",
        expectedDurationMinutes: 60,
        isLocked: true,
        status: "active" as const,
        cancelledAt: null,
        activities: [
          {
            id: "7e000000-0000-4000-8000-0000000000b1",
            position: 0,
            name: "Easy running",
            sport: "Running",
            measurementMode: "duration_intensity" as const,
            isLocked: true,
          },
        ],
      },
    ],
  };
}

function savedSession() {
  return {
    id: SAVED_ID,
    revision: 1,
    updatedAt: "2026-08-18T10:00:00.000Z",
    name: "Tuesday tempo",
    title: "Tempo run",
    sport: "Running",
    activities: [],
  };
}

function form(values: Record<string, string>) {
  const formData = new FormData();
  formData.set("expectedRevision", "0");
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
