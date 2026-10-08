import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, createProfileMock, revalidatePathMock } =
  vi.hoisted(() => ({
    createRepositoryMock: vi.fn(),
    createProfileMock: vi.fn(),
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
vi.mock("@/server/repositories/profile-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/repositories/profile-repository")
  >()),
  createProfileRepository: createProfileMock,
}));

import { INITIAL_GOAL_ACTION_STATE } from "./action-state";
import { changeGoalAction } from "./actions";
import {
  GoalAuthenticationError,
  GoalConflictError,
  GoalPersistenceError,
} from "@/server/repositories/goal-repository";
import { GoalValidationError } from "@/server/goals/goal-records";

describe("goal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The owner's day is 7 Oct 2026 in Berlin, whatever the wall clock says.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T10:00:00.000Z"));
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ timezoneName: "Europe/Berlin" }),
    });
  });
  afterEach(() => vi.useRealTimers());

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
        sports: ["Trail running", "Hiking"],
        priorityTier: "core",
      }),
      0,
    );
    // Only the goals route renders goal data, and every extra revalidation
    // re-prefetches the whole navigation, which widened the M2-05 window.
    expect(revalidatePathMock).toHaveBeenCalledExactlyOnceWith(
      "/home/you/goals",
    );
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

  it("refuses a goal that names no sport and keeps what was typed", async () => {
    const create = vi.fn();
    createRepositoryMock.mockResolvedValue({ create });
    const form = createForm();
    form.set("sports", " , ");

    const result = await changeGoalAction(INITIAL_GOAL_ACTION_STATE, form);

    expect(result.status).toBe("validation");
    expect(result.draft).toMatchObject({ title: "Run a trail event" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a new goal whose target date is before today", async () => {
    const create = vi.fn();
    createRepositoryMock.mockResolvedValue({ create });
    const form = createForm();
    form.set("targetDate", "2026-10-06");

    const result = await changeGoalAction(INITIAL_GOAL_ACTION_STATE, form);

    expect(result.status).toBe("validation");
    expect(result.message).toMatch(/cannot be before today/i);
    expect(result.draft).toMatchObject({ targetDate: "2026-10-06" });
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts today as a target date", async () => {
    const create = vi.fn().mockResolvedValue({});
    createRepositoryMock.mockResolvedValue({ create });
    const form = createForm();
    form.set("targetDate", "2026-10-07");

    await expect(
      changeGoalAction(INITIAL_GOAL_ACTION_STATE, form),
    ).resolves.toMatchObject({ status: "saved" });
  });

  it.each([
    ["keeps a date that has passed since", "2026-09-01", "saved"],
    ["refuses a date changed to another past day", "2026-09-02", "validation"],
  ])("on an edit, %s", async (_name, targetDate, status) => {
    const edit = vi.fn().mockResolvedValue({});
    createRepositoryMock.mockResolvedValue({
      edit,
      list: vi.fn().mockResolvedValue({
        revision: 0,
        goals: [
          {
            id: "52000000-0000-4000-8000-000000000001",
            targetDate: "2026-09-01",
          },
        ],
      }),
    });
    const form = createForm();
    form.set("operation", "edit");
    form.set("goalId", "52000000-0000-4000-8000-000000000001");
    form.set("originalPriorityTier", "core");
    form.set("targetDate", targetDate);

    const result = await changeGoalAction(INITIAL_GOAL_ACTION_STATE, form);

    expect(result.status).toBe(status);
    if (status === "validation") {
      expect(result.message).toMatch(/cannot be before today/i);
    }
    expect(edit).toHaveBeenCalledTimes(status === "saved" ? 1 : 0);
  });

  it("omits the source-tier rank when an edit changes attention tier", async () => {
    const edit = vi.fn().mockResolvedValue({
      goal_id: "52000000-0000-4000-8000-000000000001",
      collection_revision: 5,
      result: "edited",
    });
    createRepositoryMock.mockResolvedValue({
      edit,
      list: vi.fn().mockResolvedValue({ revision: 0, goals: [] }),
    });
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

  // The browser flow asserts the committed record rather than this transient
  // copy, because the surface may reload itself to recover a lost render.
  it.each([
    ["pause", "Goal paused."],
    ["resume", "Goal resumed."],
    ["achieve", "Goal marked achieved."],
    ["abandon", "Goal marked abandoned."],
    ["reopen", "Goal reopened."],
    ["delete", "Goal permanently deleted."],
  ])("reports %s as %s", async (operation, message) => {
    const transition = vi.fn().mockResolvedValue({
      goal_id: "52000000-0000-4000-8000-000000000001",
      collection_revision: 2,
      result: operation,
    });
    createRepositoryMock.mockResolvedValue({ transition });
    const form = createForm();
    form.set("operation", operation);
    form.set("goalId", "52000000-0000-4000-8000-000000000001");

    await expect(
      changeGoalAction(INITIAL_GOAL_ACTION_STATE, form),
    ).resolves.toMatchObject({ status: "saved", message });
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
  form.set("sports", "Trail running, Hiking");
  form.set("targetDate", "2026-10-10");
  form.set("priorityTier", "core");
  form.set("targetRank", "");
  return form;
}
