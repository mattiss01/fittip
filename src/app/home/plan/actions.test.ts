import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPlanMock, createProfileMock, revalidatePathMock } = vi.hoisted(
  () => ({
    createPlanMock: vi.fn(),
    createProfileMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }),
);

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

import { INITIAL_PLAN_ACTION_STATE, PLAN_WINDOW_DAYS } from "./action-state";
import { changePlanAction, confirmPlanTimezoneAction } from "./actions";
import { INITIAL_TIMEZONE_ACTION_STATE } from "./action-state";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { ProfileValidationError } from "@/server/repositories/profile-repository";
import {
  RollingPlanConflictError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  type RollingPlanChangeSet,
} from "@/server/rolling-plan/rolling-plan";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e000000-0000-4000-8000-000000000001";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

describe("plan actions", () => {
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

  it("adds a session on the first free position and revalidates only the plan", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
      materializeSeries: vi.fn().mockResolvedValue({
        planRevision: 1,
        createdCount: 0,
        skipped: [],
      }),
    });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "add",
        localDate: today(),
        title: "Aerobic run",
        sport: "Running",
        expectedDurationMinutes: "60",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      message: "Session added.",
      draft: undefined,
    });
    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.provenance).toBe("owner_manual");
    expect(changeSet.changes).toEqual([
      expect.objectContaining({
        operation: "add",
        session: expect.objectContaining({
          localDate: today(),
          // Position 0 is taken by the existing session, so the new one lands
          // in the first free slot rather than colliding.
          position: 1,
          isLocked: false,
          activities: [],
        }),
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledExactlyOnceWith("/home/plan");
  });

  it("duplicates content under a new identity, unlocked and undated by the source", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "duplicate",
        sessionId: SESSION_ID,
        localDate: shiftIsoDate(today(), 2),
      }),
    );

    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    const [change] = changeSet.changes;
    expect(change.operation).toBe("add");
    expect(change).toMatchObject({
      session: {
        title: "Aerobic run",
        sport: "Running",
        localDate: shiftIsoDate(today(), 2),
        position: 0,
        isLocked: false,
      },
    });
    if (change.operation !== "add") throw new Error("unreachable");
    expect(change.sessionId).not.toBe(SESSION_ID);
  });

  it("carries the existing activities through an edit rather than erasing them", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "edit",
        sessionId: SESSION_ID,
        title: "Long aerobic run",
        sport: "Running",
      }),
    );

    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.changes[0]).toMatchObject({
      operation: "edit",
      session: {
        title: "Long aerobic run",
        activities: [
          {
            position: 0,
            name: "Easy running",
            measurementMode: "duration_intensity",
          },
        ],
      },
    });
  });

  it.each([
    [-1, "a date already past"],
    [PLAN_WINDOW_DAYS, "a date beyond the window"],
  ])("refuses %s (%s) before reaching persistence", async (offset) => {
    const applyChangeSet = vi.fn();
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "set_recovery_day",
        localDate: shiftIsoDate(today(), offset),
        isRecoveryDay: "true",
      }),
    );

    expect(result.status).toBe("validation");
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it.each([
    [
      new RollingPlanRuleError("past-date"),
      "rule",
      /already passed/i,
      "past-date",
    ],
    [
      new RollingPlanRuleError("daily-session-limit"),
      "rule",
      /at most ten sessions/i,
      "daily-session-limit",
    ],
    [
      new RollingPlanRuleError("session-completed"),
      "rule",
      /cannot be deleted/i,
      "session-completed",
    ],
    [
      new RollingPlanConflictError(),
      "conflict",
      /changed somewhere else/i,
      "stale",
    ],
    [
      new RollingPlanTimezoneRequiredError(),
      "conflict",
      /confirm your time zone/i,
      "timezone",
    ],
  ])(
    "reports %s honestly and keeps the draft",
    async (error, status, message, conflict) => {
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet: vi.fn().mockRejectedValue(error),
      });

      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({
          operation: "add",
          localDate: today(),
          title: "Aerobic run",
          sport: "Running",
        }),
      );

      expect(result.status).toBe(status);
      expect(result.message).toMatch(message);
      expect(result.conflict).toBe(conflict);
      expect(result.draft).toMatchObject({ title: "Aerobic run" });
    },
  );

  it("composes a delete, and takes a cancelled session as its target", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
      materializeSeries: vi.fn().mockResolvedValue({
        planRevision: 1,
        createdCount: 0,
        skipped: [],
      }),
    });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({ operation: "delete", sessionId: SESSION_ID }),
    );

    expect(result).toMatchObject({
      status: "saved",
      message: "Session deleted.",
    });
    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    expect(changeSet.changes).toEqual([
      { operation: "delete", sessionId: SESSION_ID },
    ]);

    // A cancelled session is the one thing only a delete may target. Every
    // other operation still refuses it before persistence is reached.
    const cancelledSlice = {
      ...slice(),
      sessions: [
        {
          ...slice().sessions[0],
          status: "cancelled" as const,
          cancelledAt: "",
        },
      ],
    };
    const secondApply = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(cancelledSlice),
      applyChangeSet: secondApply,
    });
    await expect(
      changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({ operation: "delete", sessionId: SESSION_ID }),
      ),
    ).resolves.toMatchObject({ status: "saved" });

    const thirdApply = vi.fn();
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(cancelledSlice),
      applyChangeSet: thirdApply,
    });
    await expect(
      changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({ operation: "cancel", sessionId: SESSION_ID }),
      ),
    ).resolves.toMatchObject({ status: "validation" });
    expect(thirdApply).not.toHaveBeenCalled();
  });

  it("reports a deleted occurrence that its series wrote straight back", async () => {
    const occurrence = {
      ...slice().sessions[0],
      seriesId: "7e000000-0000-4000-8000-000000000099",
      occurrenceDate: today(),
      hasDiverged: false,
    };
    const planFor = (refilled: boolean) => {
      const getPlanSlice = vi
        .fn()
        .mockResolvedValueOnce({ ...slice(), sessions: [occurrence] })
        .mockResolvedValueOnce({
          ...slice(),
          revision: 2,
          sessions: refilled ? [occurrence] : [],
        });
      return {
        getPlanSlice,
        applyChangeSet: vi
          .fn()
          .mockResolvedValue({ result: "applied", planRevision: 1 }),
        materializeSeries: vi
          .fn()
          .mockResolvedValue({ planRevision: 2, createdCount: 1, skipped: [] }),
      };
    };

    // The accepted behavior of 29 August 2026: the top-up that follows every
    // plan change sees the rule date uncovered and refills it. The toast may
    // not claim the session is gone while the owner can still see it.
    const wrote = planFor(true);
    createPlanMock.mockResolvedValue(wrote);
    const back = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({ operation: "delete", sessionId: SESSION_ID }),
    );
    expect(back.status).toBe("saved");
    expect(back.message).toMatch(/written back by its recurring series/i);
    // The confirmation is one bounded read of the rule date, not of the window.
    expect(wrote.getPlanSlice).toHaveBeenCalledTimes(2);
    expect(wrote.getPlanSlice.mock.calls[1]).toEqual([today(), today()]);

    // A top-up that created something elsewhere leaves this date empty, and
    // then the ordinary copy is the true one.
    const stayedGone = planFor(false);
    createPlanMock.mockResolvedValue(stayedGone);
    await expect(
      changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({ operation: "delete", sessionId: SESSION_ID }),
      ),
    ).resolves.toMatchObject({ status: "saved", message: "Session deleted." });

    // The delete is already permanent when the confirming read fails, so the
    // owner is told what is actually unknown rather than told the plan change
    // failed. Without this the throw would escape into the action's catch and
    // report a successful delete as an error.
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi
        .fn()
        .mockResolvedValueOnce({ ...slice(), sessions: [occurrence] })
        .mockRejectedValueOnce(new Error("read failed after the delete")),
      applyChangeSet: vi
        .fn()
        .mockResolvedValue({ result: "applied", planRevision: 1 }),
      materializeSeries: vi
        .fn()
        .mockResolvedValue({ planRevision: 2, createdCount: 1, skipped: [] }),
    });
    const unsure = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({ operation: "delete", sessionId: SESSION_ID }),
    );
    expect(unsure.status).toBe("saved");
    expect(unsure.message).toMatch(/may have written the date back/i);
  });

  it("reports a stale revision without calling persistence", async () => {
    const applyChangeSet = vi.fn();
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue({ ...slice(), revision: 9 }),
      applyChangeSet,
    });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({ operation: "cancel", sessionId: SESSION_ID }),
    );

    expect(result).toMatchObject({ status: "conflict", conflict: "stale" });
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it("refuses to plan at all while the owner has no stored zone", async () => {
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "u",
        createdAt: "",
        timezoneName: null,
      }),
    });
    const getPlanSlice = vi.fn();
    createPlanMock.mockResolvedValue({ getPlanSlice, applyChangeSet: vi.fn() });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({ operation: "cancel", sessionId: SESSION_ID }),
    );

    expect(result).toMatchObject({ status: "conflict", conflict: "timezone" });
    expect(getPlanSlice).not.toHaveBeenCalled();
  });

  it("stores a confirmed zone and reports an unrecognized one", async () => {
    const confirmTimezone = vi.fn().mockResolvedValue({});
    createProfileMock.mockResolvedValue({ confirmTimezone });

    await expect(
      confirmPlanTimezoneAction(
        INITIAL_TIMEZONE_ACTION_STATE,
        form({ timezoneName: TIMEZONE }),
      ),
    ).resolves.toMatchObject({ status: "saved" });
    expect(confirmTimezone).toHaveBeenCalledWith(TIMEZONE);
    expect(revalidatePathMock).toHaveBeenCalledExactlyOnceWith("/home/plan");

    createProfileMock.mockResolvedValue({
      confirmTimezone: vi.fn().mockRejectedValue(new ProfileValidationError()),
    });
    await expect(
      confirmPlanTimezoneAction(
        INITIAL_TIMEZONE_ACTION_STATE,
        form({ timezoneName: "Nowhere/Imaginary" }),
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
        id: SESSION_ID,
        localDate: today(),
        position: 0,
        title: "Aerobic run",
        sport: "Running",
        isLocked: false,
        status: "active" as const,
        cancelledAt: null,
        activities: [
          {
            id: "7e000000-0000-4000-8000-0000000000b1",
            position: 0,
            name: "Easy running",
            sport: "Running",
            measurementMode: "duration_intensity" as const,
            isLocked: false,
          },
        ],
      },
    ],
  };
}

function form(values: Record<string, string>) {
  const formData = new FormData();
  formData.set("expectedRevision", "0");
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
