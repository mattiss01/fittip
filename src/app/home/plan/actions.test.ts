import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, revalidatePathMock } = vi.hoisted(() => ({
  createRepositoryMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock(
  "@/server/repositories/training-record-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/repositories/training-record-repository")
      >();
    return {
      ...actual,
      createTrainingRecordRepository: createRepositoryMock,
    };
  },
);

import {
  archivePersonalActivityAction,
  createPersonalActivityAction,
  savePlanAction,
  updatePersonalActivityAction,
} from "./actions";
import {
  TrainingPlanConflictError,
  TrainingRecordAuthenticationError,
  TrainingRecordPersistenceError,
} from "@/server/repositories/training-record-repository";
import { TrainingRecordValidationError } from "@/server/training/training-records";

describe("M1-02 planning server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves through the accepted atomic repository and revalidates Plan", async () => {
    const saveManualPlan = vi.fn().mockResolvedValue({
      versionNumber: 4,
      acceptedAt: "2026-07-28T16:00:00.000Z",
    });
    createRepositoryMock.mockResolvedValue({ saveManualPlan });
    const plan = {
      dayCount: 1,
      startDate: "2026-07-28",
      timezoneName: "Europe/Berlin",
      sessions: [],
    };

    await expect(savePlanAction(plan, 3)).resolves.toEqual({
      status: "saved",
      revision: 4,
      versionNumber: 4,
      acceptedAt: "2026-07-28T16:00:00.000Z",
    });
    expect(saveManualPlan).toHaveBeenCalledWith(plan, 3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan");
  });

  it.each([
    [
      new TrainingRecordValidationError(),
      "validation-error",
      /highlighted plan details/i,
    ],
    [new TrainingPlanConflictError(), "conflict", /changed in another tab/i],
    [
      new TrainingRecordAuthenticationError(),
      "session-expired",
      /session ended/i,
    ],
    [
      new TrainingRecordPersistenceError(),
      "save-error",
      /draft is still here/i,
    ],
  ])(
    "maps repository failures to honest UI states",
    async (error, status, copy) => {
      createRepositoryMock.mockResolvedValue({
        saveManualPlan: vi.fn().mockRejectedValue(error),
      });

      const result = await savePlanAction({}, 0);

      expect(result.status).toBe(status);
      expect("message" in result ? result.message : "").toMatch(copy);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("creates, updates, and archives only through verified repositories", async () => {
    const activity = {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Easy run",
      sport: "Running",
      description: null,
      measurementMode: "time_distance_pace",
      defaultMeasurement: { duration_seconds: 1800 },
    };
    const createPersonalActivity = vi.fn().mockResolvedValue(activity);
    const updatePersonalActivity = vi.fn().mockResolvedValue({
      ...activity,
      name: "Steady run",
    });
    const archivePersonalActivity = vi.fn().mockResolvedValue({
      ...activity,
      archivedAt: "2026-07-28T16:00:00.000Z",
    });
    createRepositoryMock.mockResolvedValue({
      createPersonalActivity,
      updatePersonalActivity,
      archivePersonalActivity,
    });

    await expect(
      createPersonalActivityAction({
        name: "Easy run",
        sport: "Running",
        measurementMode: "time_distance_pace",
      }),
    ).resolves.toMatchObject({
      status: "saved",
      activity: { name: "Easy run" },
    });
    await expect(
      updatePersonalActivityAction(activity.id, {
        name: "Steady run",
        sport: "Running",
        measurementMode: "time_distance_pace",
      }),
    ).resolves.toMatchObject({
      status: "saved",
      activity: { name: "Steady run" },
    });
    await expect(archivePersonalActivityAction(activity.id)).resolves.toEqual({
      status: "archived",
      id: activity.id,
    });
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
  });
});
