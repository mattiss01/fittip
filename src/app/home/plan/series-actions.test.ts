import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPlanMock,
  createProfileMock,
  createSavedLibraryMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createPlanMock: vi.fn(),
  createProfileMock: vi.fn(),
  createSavedLibraryMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
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
vi.mock("@/server/repositories/saved-session-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/saved-session-repository")
    >();
  return { ...actual, createSavedSessionLibrary: createSavedLibraryMock };
});

import {
  INITIAL_MATERIALIZE_ACTION_STATE,
  INITIAL_SERIES_ACTION_STATE,
} from "./series-action-state";
import {
  changeSeriesAction,
  materializePlanSeriesAction,
} from "./series-actions";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import type { RollingPlanChangeSet } from "@/server/rolling-plan/rolling-plan";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e100000-0000-4000-8000-000000000001";
const SERIES_ID = "7e100000-0000-4000-8000-000000000002";
const SAVED_ID = "7e100000-0000-4000-8000-000000000003";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

describe("recurring-session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "owner",
        timezoneName: TIMEZONE,
        createdAt: "",
      }),
    });
  });

  it("creates from the server-read saved entry and reports materializer skips", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({
      planRevision: 4,
      seriesEffects: [],
    });
    const materializeSeries = vi.fn().mockResolvedValue({
      planRevision: 5,
      createdCount: 2,
      skipped: [
        {
          seriesId: SERIES_ID,
          occurrenceDate: shiftIsoDate(today(), 1),
          reason: "daily-session-limit",
        },
      ],
    });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      listSeries: vi.fn().mockResolvedValue([]),
      applyChangeSet,
      materializeSeries,
    });
    createSavedLibraryMock.mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        id: SAVED_ID,
        revision: 1,
        name: "Tempo",
        title: "Tempo run",
        sport: "Running",
        activities: [],
        updatedAt: "",
      }),
    });

    const result = await changeSeriesAction(
      INITIAL_SERIES_ACTION_STATE,
      form({
        operation: "add_series",
        sourceKind: "saved",
        sourceId: SAVED_ID,
        startDate: today(),
        frequency: "daily",
        intervalCount: "1",
        noEnd: "false",
        endDate: shiftIsoDate(today(), 2),
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      skipped: [
        {
          occurrenceDate: shiftIsoDate(today(), 1),
          reason: "daily-session-limit",
        },
      ],
    });
    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.provenance).toBe("owner_series");
    expect(changeSet.changes[0]).toMatchObject({
      operation: "add_series",
      series: {
        frequency: "daily",
        startDate: today(),
        endDate: shiftIsoDate(today(), 2),
        title: "Tempo run",
      },
    });
    expect(materializeSeries).toHaveBeenCalledWith(expect.any(String), 4);
  });

  it("reports only the authoritative end-series effect after success", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({
      planRevision: 8,
      seriesEffects: [
        {
          seriesId: SERIES_ID,
          operation: "end_series",
          deleted: 2,
          divergedDeleted: 1,
          lockedKept: 1,
        },
      ],
    });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(seriesSlice()),
      listSeries: vi.fn().mockResolvedValue([segment()]),
      applyChangeSet,
      materializeSeries: vi.fn().mockResolvedValue({
        planRevision: 8,
        createdCount: 0,
        skipped: [],
      }),
    });

    const result = await changeSeriesAction(
      INITIAL_SERIES_ACTION_STATE,
      form({ operation: "end_series", sessionId: SESSION_ID }),
    );

    expect(result).toMatchObject({
      status: "saved",
      effect: { deleted: 2, divergedDeleted: 1, lockedKept: 1 },
    });
    expect(result.message).toContain("2 unchanged removed");
    expect(result.message).toContain("1 changed removed");
    expect(result.message).toContain("1 locked kept");
    expect(result.message).not.toMatch(/expect|forecast|estimate/i);
  });

  it("withholds the known end-series no-op on an occurrence past its segment end", async () => {
    const applyChangeSet = vi.fn();
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(seriesSlice()),
      listSeries: vi
        .fn()
        .mockResolvedValue([
          { ...segment(), endDate: shiftIsoDate(today(), -1) },
        ]),
      applyChangeSet,
    });

    const result = await changeSeriesAction(
      INITIAL_SERIES_ACTION_STATE,
      form({ operation: "end_series", sessionId: SESSION_ID }),
    );

    expect(result.status).toBe("validation");
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it("splits this-and-future from the occurrence and preserves the template activities", async () => {
    const effectiveDate = shiftIsoDate(today(), 2);
    const applyChangeSet = vi.fn().mockResolvedValue({
      planRevision: 9,
      seriesEffects: [],
    });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(
        seriesSlice({
          occurrenceDate: effectiveDate,
          localDate: effectiveDate,
        }),
      ),
      listSeries: vi.fn().mockResolvedValue([segment()]),
      applyChangeSet,
      materializeSeries: vi.fn().mockResolvedValue({
        planRevision: 10,
        createdCount: 2,
        skipped: [],
      }),
    });

    await changeSeriesAction(
      INITIAL_SERIES_ACTION_STATE,
      form({
        operation: "edit_series",
        sessionId: SESSION_ID,
        title: "Long aerobic run",
        sport: "Running",
        frequency: "weekly",
        intervalCount: "1",
        weekdays: ["1", "4"],
        noEnd: "true",
      }),
    );

    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.changes[0]).toMatchObject({
      operation: "edit_series",
      seriesId: SERIES_ID,
      effectiveDate,
      successorSeriesId: expect.any(String),
      series: {
        startDate: effectiveDate,
        title: "Long aerobic run",
        activities: [
          expect.objectContaining({
            name: "Easy running",
            measurementMode: "duration_intensity",
          }),
        ],
      },
    });
  });

  it("materializes only through the explicit Server Action", async () => {
    const materializeSeries = vi.fn().mockResolvedValue({
      planRevision: 6,
      createdCount: 3,
      skipped: [],
    });
    createPlanMock.mockResolvedValue({ materializeSeries });

    await expect(
      materializePlanSeriesAction(INITIAL_MATERIALIZE_ACTION_STATE, form({})),
    ).resolves.toMatchObject({
      status: "saved",
      createdCount: 3,
    });
    expect(materializeSeries).toHaveBeenCalledWith(expect.any(String), 3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan");
  });
});

function slice() {
  return {
    planId: "7e100000-0000-4000-8000-000000000010",
    revision: 3,
    sessions: [],
    recoveryDates: [],
  };
}

function seriesSlice(overrides: Partial<ReturnType<typeof occurrence>> = {}) {
  return {
    ...slice(),
    sessions: [{ ...occurrence(), ...overrides }],
  };
}

function occurrence() {
  return {
    id: SESSION_ID,
    localDate: today(),
    position: 0,
    title: "Aerobic run",
    sport: "Running",
    isLocked: true,
    status: "active" as const,
    cancelledAt: null,
    seriesId: SERIES_ID,
    occurrenceDate: today(),
    hasDiverged: false,
    activities: [],
  };
}

function segment() {
  return {
    id: SERIES_ID,
    predecessorSeriesId: null,
    frequency: "daily" as const,
    intervalCount: 1,
    startDate: shiftIsoDate(today(), -2),
    title: "Aerobic run",
    sport: "Running",
    activities: [
      {
        position: 0,
        name: "Easy running",
        sport: "Running",
        measurementMode: "duration_intensity" as const,
      },
    ],
  };
}

function form(values: Record<string, string | string[]>) {
  const formData = new FormData();
  formData.set("expectedRevision", "3");
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) formData.append(key, item);
    } else {
      formData.set(key, value);
    }
  }
  return formData;
}
