import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createGoalRepositoryMock,
  createMemoryRepositoryMock,
  createProfileRepositoryMock,
  redirectMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createGoalRepositoryMock: vi.fn(),
  createMemoryRepositoryMock: vi.fn(),
  createProfileRepositoryMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/repositories/goal-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/repositories/goal-repository")
  >()),
  createGoalRepository: createGoalRepositoryMock,
}));
vi.mock("@/server/repositories/memory-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/repositories/memory-repository")
  >()),
  createMemoryRepository: createMemoryRepositoryMock,
}));
vi.mock("@/server/repositories/profile-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/repositories/profile-repository")
  >()),
  createProfileRepository: createProfileRepositoryMock,
}));

import { INITIAL_SETUP_ACTION_STATE } from "./action-state";
import {
  finishSetupAction,
  leaveSetupAction,
  recordSetupStepAction,
  saveSetupGoalsAction,
  startSetupAction,
} from "./actions";
import {
  GoalConflictError,
  type Goal,
} from "@/server/repositories/goal-repository";

const GOAL_ID = "70000000-0000-4000-8000-000000000001";
const NEW_ID = "70000000-0000-4000-8000-000000000002";

describe("guided setup actions", () => {
  const goals = { list: vi.fn(), create: vi.fn(), edit: vi.fn() };
  const memory = { list: vi.fn(), create: vi.fn() };
  const profiles = {
    getDetails: vi.fn(),
    saveSports: vi.fn(),
    saveSetupStep: vi.fn(),
    skipSetup: vi.fn(),
    finishSetup: vi.fn(),
    startSetup: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    createGoalRepositoryMock.mockResolvedValue(goals);
    createMemoryRepositoryMock.mockResolvedValue(memory);
    createProfileRepositoryMock.mockResolvedValue(profiles);
    goals.list.mockResolvedValue({ revision: 4, goals: [savedGoal()] });
    goals.create.mockResolvedValue({ goal_id: NEW_ID, collection_revision: 5 });
    goals.edit.mockResolvedValue({ goal_id: GOAL_ID, collection_revision: 5 });
    memory.list.mockResolvedValue({ revision: 2, items: [] });
    memory.create.mockImplementation(
      async (_type, _content, _date, revision) => ({
        collection_revision: revision + 1,
      }),
    );
    profiles.getDetails.mockResolvedValue({ sports: ["Running"] });
  });

  it("creates a goal typed in setup as a goal, with the owner's day as its start", async () => {
    goals.list.mockResolvedValue({ revision: 0, goals: [] });
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([{ title: "Finish a calm 10K", sport: "Running" }]),
    );

    expect(state).toMatchObject({
      status: "saved",
      submission: 1,
      goalIds: [NEW_ID],
    });
    expect(goals.create).toHaveBeenCalledExactlyOnceWith(
      {
        title: "Finish a calm 10K",
        desiredOutcome: "Run the autumn event with even pacing.",
        category: "other",
        activityAreas: ["Running"],
        startDate: "2026-10-06",
        priorityTier: "core",
      },
      0,
    );
    expect(goals.edit).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("edits a goal the account already has, keeping what setup does not ask", async () => {
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([
        { id: GOAL_ID, title: "10k under 47 minutes", sport: "Running" },
      ]),
    );

    expect(state.status).toBe("saved");
    expect(goals.create).not.toHaveBeenCalled();
    expect(goals.edit).toHaveBeenCalledExactlyOnceWith(
      GOAL_ID,
      {
        title: "10k under 47 minutes",
        desiredOutcome: "Run the autumn event with even pacing.",
        // Its own kind, start date, reason and place among the core goals.
        category: "endurance",
        activityAreas: ["Running"],
        startDate: "2026-09-01",
        priorityTier: "core",
        targetRank: 2,
        rationale: "Kept from before",
      },
      4,
    );
  });

  it("does not write a goal again that is sent back as it is saved", async () => {
    const goal = savedGoal();
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([
        {
          id: GOAL_ID,
          title: goal.title,
          outcome: goal.desiredOutcome,
          sport: "Running",
        },
      ]),
    );

    expect(state).toMatchObject({ status: "saved", goalIds: [GOAL_ID] });
    expect(goals.edit).not.toHaveBeenCalled();
    expect(goals.create).not.toHaveBeenCalled();
  });

  it("saves several goals one after another on the revision each leaves, passing over an empty row", async () => {
    goals.list.mockResolvedValue({ revision: 0, goals: [] });
    goals.create
      .mockResolvedValueOnce({ goal_id: GOAL_ID, collection_revision: 1 })
      .mockResolvedValueOnce({ goal_id: NEW_ID, collection_revision: 2 });
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([
        { title: "Run a marathon", sport: "Running" },
        { title: "" },
        { title: "Bench press 80 kg", sport: "Latzug", tier: "supporting" },
      ]),
    );

    expect(state.goalIds).toEqual([GOAL_ID, null, NEW_ID]);
    expect(goals.create.mock.calls.map((call) => call[1])).toEqual([0, 1]);
    // A sport made up on the goals screen joins the owner's sports.
    expect(profiles.saveSports).toHaveBeenCalledExactlyOnceWith([
      "Running",
      "Latzug",
    ]);
  });

  it.each([
    ["no goal at all", [{ title: "" }]],
    ["a goal without a sport", [{ title: "Run a marathon" }]],
    [
      "an id that is not one of the owner's goals",
      [{ id: NEW_ID, title: "Run a marathon", sport: "Running" }],
    ],
  ])("refuses %s before anything is written", async (_label, rows) => {
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm(rows),
    );

    expect(state.status).toBe("validation");
    expect(goals.create).not.toHaveBeenCalled();
    expect(goals.edit).not.toHaveBeenCalled();
  });

  it("says so when a fourth core goal is refused, and reports the rows that were saved", async () => {
    goals.list.mockResolvedValue({ revision: 0, goals: [] });
    goals.create
      .mockResolvedValueOnce({ goal_id: GOAL_ID, collection_revision: 1 })
      .mockRejectedValueOnce(new GoalConflictError("core-limit"));
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([
        { title: "Run a marathon", sport: "Running" },
        { title: "Swim 2 km", sport: "Swimming" },
      ]),
    );

    expect(state).toMatchObject({
      status: "conflict",
      message: "At most three goals can be core. Make one of them supporting.",
      goalIds: [GOAL_ID],
    });
  });

  it("saves the goals screen even when the owner's sports cannot be read", async () => {
    goals.list.mockResolvedValue({ revision: 0, goals: [] });
    profiles.getDetails.mockRejectedValue(new Error("unavailable"));
    const state = await saveSetupGoalsAction(
      INITIAL_SETUP_ACTION_STATE,
      goalForm([{ title: "Run a marathon", sport: "Running" }]),
    );
    expect(state.status).toBe("saved");
  });

  it("leaves on Continue later whether or not the goals could be saved, from the screen it was on", async () => {
    const form = goalForm([{ title: "Run a marathon" }]);
    form.set("intent", "later");
    await saveSetupGoalsAction(INITIAL_SETUP_ACTION_STATE, form);

    expect(goals.create).not.toHaveBeenCalled();
    expect(profiles.skipSetup).toHaveBeenCalledExactlyOnceWith(7);
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/home/today");
  });

  it("files each field of the last screen in Memory as written, then finishes setup", async () => {
    const state = await finishSetupAction(
      INITIAL_SETUP_ACTION_STATE,
      notesForm([
        ["injury", "Left knee, 2019"],
        ["enjoy", "  Long runs   outdoors "],
        ["why", ""],
      ]),
    );

    expect(state.status).toBe("saved");
    expect(memory.create.mock.calls).toEqual([
      ["constraint", "An old injury: Left knee, 2019", undefined, 2],
      ["preference", "What I enjoy: Long runs outdoors", undefined, 3],
    ]);
    expect(profiles.finishSetup).toHaveBeenCalledOnce();
    // Straight back to You, which says setup is saved.
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(
      "/home/you?setup=done",
    );
  });

  it("finishes setup with nothing written, without touching Memory", async () => {
    const state = await finishSetupAction(
      INITIAL_SETUP_ACTION_STATE,
      notesForm([]),
    );

    expect(state.status).toBe("saved");
    expect(createMemoryRepositoryMock).not.toHaveBeenCalled();
    expect(profiles.finishSetup).toHaveBeenCalledOnce();
  });

  it("passes over text Memory already holds, so pressing Finish again is safe", async () => {
    memory.list.mockResolvedValue({
      revision: 3,
      items: [{ content: "An old injury: Left knee, 2019" }],
    });
    await finishSetupAction(
      INITIAL_SETUP_ACTION_STATE,
      notesForm([
        ["injury", "Left knee, 2019"],
        ["enjoy", "Long runs outdoors"],
      ]),
    );

    expect(memory.create).toHaveBeenCalledExactlyOnceWith(
      "preference",
      "What I enjoy: Long runs outdoors",
      undefined,
      3,
    );
  });

  it("does not finish setup when a field is refused, and stays on the screen", async () => {
    const state = await finishSetupAction(
      INITIAL_SETUP_ACTION_STATE,
      notesForm([["injury", "x".repeat(301)]]),
    );

    expect(state.status).toBe("validation");
    expect(memory.create).not.toHaveBeenCalled();
    expect(profiles.finishSetup).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("saves what was written on Continue later without finishing setup", async () => {
    const form = notesForm([["injury", "Left knee, 2019"]]);
    form.set("intent", "later");
    await finishSetupAction(INITIAL_SETUP_ACTION_STATE, form);

    expect(memory.create).toHaveBeenCalledOnce();
    expect(profiles.finishSetup).not.toHaveBeenCalled();
    expect(profiles.skipSetup).toHaveBeenCalledExactlyOnceWith(12);
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/home/today");
  });

  it("records the screen setup moved to, and nothing that is not a screen", async () => {
    await recordSetupStepAction(9);
    expect(profiles.saveSetupStep).toHaveBeenCalledExactlyOnceWith(9);

    profiles.saveSetupStep.mockClear();
    await recordSetupStepAction(13);
    await recordSetupStepAction(0);
    expect(profiles.saveSetupStep).not.toHaveBeenCalled();
  });

  it("leaves setup even when the skip cannot be recorded", async () => {
    profiles.skipSetup.mockRejectedValue(new Error("unavailable"));
    await leaveSetupAction(3);
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/home/today");
  });

  it("begins setup from You and opens it", async () => {
    await startSetupAction();
    expect(profiles.startSetup).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(
      "/home/you/onboarding",
    );
  });
});

function savedGoal(): Goal {
  return {
    id: GOAL_ID,
    title: "10k under 48 minutes",
    desiredOutcome: "Run it in autumn.",
    category: "endurance",
    activityAreas: ["Running"],
    startDate: "2026-09-01",
    targetDate: null,
    targetDetail: null,
    targetMetricLabel: null,
    targetMetricValue: null,
    targetMetricUnit: null,
    priorityTier: "core",
    status: "active",
    activeRank: 2,
    rationale: "Kept from before",
    constraints: null,
    archivedAt: null,
  };
}

function goalForm(
  rows: {
    id?: string;
    title: string;
    outcome?: string;
    sport?: string;
    tier?: string;
  }[],
) {
  const form = new FormData();
  form.set("goalCount", String(rows.length));
  form.set("setupStep", "7");
  form.set("intent", "continue");
  rows.forEach((row, index) => {
    form.set(`goalId:${index}`, row.id ?? "");
    form.set(`goalTitle:${index}`, row.title);
    form.set(
      `goalOutcome:${index}`,
      row.outcome ?? "Run the autumn event with even pacing.",
    );
    form.set(`goalActivities:${index}`, row.sport ?? "");
    form.set(`goalStartDate:${index}`, "2026-10-06");
    form.set(`goalTargetDate:${index}`, "");
    form.set(`goalTier:${index}`, row.tier ?? "core");
  });
  return form;
}

function notesForm(notes: [kind: string, text: string][]) {
  const form = new FormData();
  form.set("setupStep", "12");
  form.set("intent", "continue");
  for (const [kind, text] of notes) {
    form.append("noteKind", kind);
    form.append("noteText", text);
  }
  return form;
}
