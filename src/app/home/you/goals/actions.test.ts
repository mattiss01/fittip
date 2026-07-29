import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, revalidatePathMock } = vi.hoisted(() => ({
  createRepositoryMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/goal-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/repositories/goal-repository")
    >();
  return { ...actual, createGoalRepository: createRepositoryMock };
});

import { INITIAL_GOAL_ACTION_STATE } from "./action-state";
import { changeGoalAction } from "./actions";
import {
  GoalAuthenticationError,
  GoalConflictError,
  GoalPersistenceError,
} from "@/server/repositories/goal-repository";
import { GoalValidationError } from "@/server/goals/goal-records";

describe("goal actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes validated content to an authenticated repository and revalidates You", async () => {
    const create = vi.fn().mockResolvedValue({
      goal_id: "52000000-0000-4000-8000-000000000001",
      collection_revision: 1,
      result: "created",
    });
    createRepositoryMock.mockResolvedValue({ create });

    const result = await changeGoalAction(
      INITIAL_GOAL_ACTION_STATE,
      createForm(),
    );

    expect(result).toMatchObject({
      status: "saved",
      message: "Goal created.",
      submission: 1,
      operation: "create",
      draft: undefined,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Run a trail event",
        activityAreas: ["Trail running", "Hiking"],
        priorityTier: "core",
      }),
      0,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/you/goals");
  });

  it.each([
    [
      new GoalConflictError("core-limit"),
      "conflict",
      /three core goals/i,
      "core-limit",
    ],
    [new GoalConflictError("stale"), "conflict", /another tab/i, "stale"],
    [new GoalAuthenticationError(), "session", /session ended/i, undefined],
    [new GoalPersistenceError(), "error", /could not be confirmed/i, undefined],
  ])(
    "maps failures to honest content-safe states",
    async (error, status, copy, conflict) => {
      createRepositoryMock.mockResolvedValue({
        create: vi.fn().mockRejectedValue(error),
      });

      const result = await changeGoalAction(
        INITIAL_GOAL_ACTION_STATE,
        createForm(),
      );

      expect(result.status).toBe(status);
      expect(result.message).toMatch(copy);
      expect(result.conflict).toBe(conflict);
      expect(result.draft).toMatchObject({
        title: "Run a trail event",
        priorityTier: "core",
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("omits the source-tier rank when an edit changes attention tier", async () => {
    const edit = vi.fn().mockResolvedValue({
      goal_id: "52000000-0000-4000-8000-000000000001",
      collection_revision: 5,
      result: "edited",
    });
    createRepositoryMock.mockResolvedValue({ edit });
    const form = createForm();
    form.set("operation", "edit");
    form.set("goalId", "52000000-0000-4000-8000-000000000001");
    form.set("originalPriorityTier", "core");
    form.set("priorityTier", "supporting");
    form.set("targetRank", "2");

    await changeGoalAction(INITIAL_GOAL_ACTION_STATE, form);

    expect(edit).toHaveBeenCalledWith(
      "52000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        priorityTier: "supporting",
        targetRank: undefined,
      }),
      0,
    );
  });

  it("returns a validation state for malformed form content", async () => {
    const create = vi.fn().mockRejectedValue(new GoalValidationError());
    createRepositoryMock.mockResolvedValue({ create });
    const form = createForm();
    form.set("targetDate", "2026-07-01");

    await expect(
      changeGoalAction(INITIAL_GOAL_ACTION_STATE, form),
    ).resolves.toMatchObject({ status: "validation" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

function createForm() {
  const form = new FormData();
  form.set("operation", "create");
  form.set("expectedRevision", "0");
  form.set("title", "Run a trail event");
  form.set("desiredOutcome", "Finish with steady pacing.");
  form.set("category", "performance_event");
  form.set("activityAreas", "Trail running, Hiking");
  form.set("startDate", "2026-07-29");
  form.set("targetDate", "2026-10-10");
  form.set("targetDetail", "");
  form.set("targetMetricLabel", "Finish time");
  form.set("targetMetricValue", "Under 3 hours");
  form.set("targetMetricUnit", "hours");
  form.set("priorityTier", "core");
  form.set("targetRank", "");
  form.set("rationale", "");
  form.set("constraints", "");
  return form;
}
