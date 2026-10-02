import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPlanMock,
  createProfileMock,
  recordAcceptedMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createPlanMock: vi.fn(),
  createProfileMock: vi.fn(),
  recordAcceptedMock: vi.fn(),
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
vi.mock(
  "@/server/session-detail/session-activity-acceptance",
  async (original) => {
    const actual =
      await original<
        typeof import("@/server/session-detail/session-activity-acceptance")
      >();
    return {
      ...actual,
      recordAcceptedSessionActivities: recordAcceptedMock,
    };
  },
);
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});

import {
  INITIAL_PLAN_ACTION_STATE,
  PLAN_PLACEMENT_DAYS,
  PLAN_WINDOW_DAYS,
} from "./action-state";
import { changePlanAction, confirmPlanTimezoneAction } from "./actions";
import { INITIAL_TIMEZONE_ACTION_STATE } from "./action-state";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { ProfileValidationError } from "@/server/repositories/profile-repository";
import { ROADMAP_FORWARD_LOCKED_WINDOW_DAYS } from "@/server/training/training-history-context";
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
    recordAcceptedMock.mockResolvedValue(true);
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "u",
        createdAt: "",
        timezoneName: TIMEZONE,
      }),
    });
  });

  it("adds a session on the first free position and revalidates both surfaces that render it", async () => {
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
    // Two paths, and no more. M3-16B made a planned session editable from
    // inside a proposal review, so both surfaces render the rows this action
    // writes and both must refresh. The count still matters: the reach is two
    // routes this action names, never a path a caller hands it.
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/home/plan"],
      ["/home/plan/proposal"],
    ]);
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

  it("replaces the activity list on an edit with the one submitted", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    // The session in the slice holds one `duration_intensity` activity. The
    // editor submits the whole list every time, so what arrives here wins —
    // that is how a row the owner removed stops existing.
    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "edit",
        sessionId: SESSION_ID,
        title: "Long aerobic run",
        sport: "Running",
        activities: JSON.stringify([
          {
            name: "Back squat",
            sport: "Strength",
            instructions: null,
            measurementMode: "sets_reps_load",
            target: { sets: 5, reps: 5, load: 82.5, load_unit: "kg" },
          },
        ]),
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
            name: "Back squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            target: { sets: 5, reps: 5, load: 82.5, load_unit: "kg" },
            isLocked: false,
          },
        ],
      },
    });
  });

  it("refuses a missing activities field instead of reading it as empty", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    // On an edit the list submitted is the list kept, so "no field" and "no
    // activities" must not be the same answer: the first is a broken form and
    // the second is a session the owner emptied on purpose.
    const formData = form({
      operation: "edit",
      sessionId: SESSION_ID,
      title: "Long aerobic run",
      sport: "Running",
    });
    formData.delete("activities");

    const result = await changePlanAction(INITIAL_PLAN_ACTION_STATE, formData);

    expect(result.status).toBe("validation");
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it("numbers positions by the order submitted", async () => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "add",
        localDate: today(),
        title: "Strength",
        sport: "Strength",
        activities: JSON.stringify([
          { name: "A", sport: "S", measurementMode: "custom", target: null },
          { name: "B", sport: "S", measurementMode: "custom", target: null },
        ]),
      }),
    );

    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    const [change] = changeSet.changes;
    if (change.operation !== "add") throw new Error("unreachable");
    expect(
      change.session.activities.map((activity) => activity.position),
    ).toEqual([0, 1]);
  });

  it.each([
    ["a lock", { isLocked: true }],
    ["a position", { position: 9 }],
  ])(
    "refuses a payload that names %s",
    async (_label, extra: Record<string, unknown>) => {
      const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet,
      });

      // Neither is a field any surface sets, so a submission carrying one is
      // not an honest form. It is refused rather than normalized away, which
      // is the rule the series template already follows for `isLocked`.
      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({
          operation: "add",
          localDate: today(),
          title: "Strength",
          sport: "Strength",
          activities: JSON.stringify([
            {
              name: "A",
              sport: "S",
              measurementMode: "custom",
              target: null,
              ...extra,
            },
          ]),
        }),
      );

      expect(result.status).toBe("validation");
      expect(applyChangeSet).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["not JSON at all", "{"],
    ["not an array", JSON.stringify({ name: "A" })],
    [
      "an unknown measurement mode",
      JSON.stringify([
        { name: "A", sport: "S", measurementMode: "vibes", target: null },
      ]),
    ],
    [
      "a target the server refuses",
      JSON.stringify([
        {
          name: "A",
          sport: "S",
          measurementMode: "sets_reps_load",
          target: { sets: 5 },
        },
      ]),
    ],
    [
      "a blank name",
      JSON.stringify([
        { name: "  ", sport: "S", measurementMode: "custom", target: null },
      ]),
    ],
  ])("refuses %s", async (_label, activities) => {
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet,
    });

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "add",
        localDate: today(),
        title: "Strength",
        sport: "Strength",
        activities,
      }),
    );

    expect(result.status).toBe("validation");
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it.each([
    [-1, "a date already past"],
    [PLAN_PLACEMENT_DAYS, "a date beyond where a session may be placed"],
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

  it("places a single session exactly as far as the coach reads a locked one", () => {
    // ADR-013 decision 5 reads locked sessions through today plus this many
    // days. A race placed on the last day the Plan allows must be one the
    // coach can be sent, so the two numbers move together or not at all.
    expect(PLAN_PLACEMENT_DAYS - 1).toBe(ROADMAP_FORWARD_LOCKED_WINDOW_DAYS);
  });

  it.each([
    [PLAN_WINDOW_DAYS, "the first day past the recurring window"],
    [PLAN_PLACEMENT_DAYS - 1, "the last day a session may be placed"],
  ])("takes a single change on day %s (%s)", async (offset) => {
    // R3b-3: a single session, or a label, may sit past the dates recurring
    // sessions are written through - a race months out is a session.
    const applyChangeSet = vi.fn().mockResolvedValue({
      planRevision: 2,
      seriesEffects: [],
    });
    const getPlanSlice = vi.fn().mockResolvedValue(slice());
    createPlanMock.mockResolvedValue({
      getPlanSlice,
      applyChangeSet,
      materializeSeries: vi
        .fn()
        .mockResolvedValue({ createdCount: 0, skipped: [], planRevision: 2 }),
    });
    const localDate = shiftIsoDate(today(), offset);

    const result = await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "set_recovery_day",
        localDate,
        isRecoveryDay: "true",
      }),
    );

    expect(result.status).toBe("saved");
    expect(applyChangeSet).toHaveBeenCalledTimes(1);
    // The slice it checks against reaches the same far date.
    expect(getPlanSlice).toHaveBeenCalledWith(
      today(),
      shiftIsoDate(today(), PLAN_PLACEMENT_DAYS - 1),
    );
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

  it("carries why a session was cancelled, and nothing when the owner said nothing", async () => {
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

    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "cancel",
        sessionId: SESSION_ID,
        cancelReason: "  work ran late ",
      }),
    );
    await changePlanAction(
      INITIAL_PLAN_ACTION_STATE,
      form({
        operation: "cancel",
        sessionId: SESSION_ID,
        cancelReason: "   ",
      }),
    );

    const [withReason] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    const withoutReason = (
      applyChangeSet.mock.calls[1] as [RollingPlanChangeSet]
    )[0];
    expect(withReason.changes).toEqual([
      {
        operation: "cancel",
        sessionId: SESSION_ID,
        reason: "work ran late",
      },
    ]);
    // A blank reason is a plain cancel, as before.
    expect(withoutReason.changes).toEqual([
      { operation: "cancel", sessionId: SESSION_ID },
    ]);
  });

  it("composes a reactivate for a cancelled session and for nothing else", async () => {
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
    const applyChangeSet = vi.fn().mockResolvedValue({ result: "applied" });
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(cancelledSlice),
      applyChangeSet,
      materializeSeries: vi.fn().mockResolvedValue({
        planRevision: 1,
        createdCount: 0,
        skipped: [],
      }),
    });

    await expect(
      changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({ operation: "reactivate", sessionId: SESSION_ID }),
      ),
    ).resolves.toMatchObject({
      status: "saved",
      message: "Session reactivated.",
    });
    const [changeSet] = applyChangeSet.mock.calls[0] as [RollingPlanChangeSet];
    // The position is the database's to choose, so the form sends none.
    expect(changeSet.changes).toEqual([
      { operation: "reactivate", sessionId: SESSION_ID },
    ]);

    // An active session is refused before persistence is reached.
    const activeApply = vi.fn();
    createPlanMock.mockResolvedValue({
      getPlanSlice: vi.fn().mockResolvedValue(slice()),
      applyChangeSet: activeApply,
    });
    await expect(
      changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({ operation: "reactivate", sessionId: SESSION_ID }),
      ),
    ).resolves.toMatchObject({ status: "validation" });
    expect(activeApply).not.toHaveBeenCalled();
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

  describe("a coach's suggestion saved from the Edit panel (A7-4)", () => {
    const PROPOSAL_ID = "5a000000-0000-4000-8000-000000000001";
    const UNCHANGED_ACTIVITIES = JSON.stringify([
      {
        personalActivityId: null,
        name: "Easy running",
        sport: "Running",
        instructions: null,
        measurementMode: "duration_intensity",
        target: null,
      },
    ]);

    it("records the acceptance only after the plan write has landed", async () => {
      const order: string[] = [];
      const applyChangeSet = vi.fn(async () => {
        order.push("plan");
        return { result: "applied", planRevision: 1 };
      });
      recordAcceptedMock.mockImplementation(async () => {
        order.push("decision");
        return true;
      });
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet,
        materializeSeries: vi.fn().mockResolvedValue({
          planRevision: 1,
          createdCount: 0,
          skipped: [],
        }),
      });
      const formData = form({
        operation: "edit",
        sessionId: SESSION_ID,
        title: "Aerobic run",
        sport: "Running",
        activities: "[]",
      });
      formData.append("activityProposalId", PROPOSAL_ID);

      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        formData,
      );

      expect(result.status).toBe("saved");
      expect(order).toEqual(["plan", "decision"]);
      expect(recordAcceptedMock).toHaveBeenCalledWith(formData);
    });

    it("does not record anything when the plan write is refused", async () => {
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet: vi
          .fn()
          .mockRejectedValue(new RollingPlanConflictError()),
      });
      const formData = form({
        operation: "edit",
        sessionId: SESSION_ID,
        title: "Aerobic run",
        sport: "Running",
        activities: "[]",
      });
      formData.append("activityProposalId", PROPOSAL_ID);

      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        formData,
      );

      expect(result.status).toBe("conflict");
      expect(recordAcceptedMock).not.toHaveBeenCalled();
    });

    it("says so when the save landed but the acceptance could not be written", async () => {
      recordAcceptedMock.mockResolvedValue(false);
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet: vi
          .fn()
          .mockResolvedValue({ result: "applied", planRevision: 1 }),
        materializeSeries: vi.fn().mockResolvedValue({
          planRevision: 1,
          createdCount: 0,
          skipped: [],
        }),
      });

      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({
          operation: "edit",
          sessionId: SESSION_ID,
          title: "Aerobic run",
          sport: "Running",
          activities: "[]",
        }),
      );

      expect(result.status).toBe("saved");
      expect(result.message).toContain(
        "could not be marked as used, but your session is saved",
      );
    });

    it("refreshes the Plan on an unchanged save, so a suggestion saved past comes back", async () => {
      const applyChangeSet = vi.fn();
      createPlanMock.mockResolvedValue({
        getPlanSlice: vi.fn().mockResolvedValue(slice()),
        applyChangeSet,
      });

      const result = await changePlanAction(
        INITIAL_PLAN_ACTION_STATE,
        form({
          operation: "edit",
          sessionId: SESSION_ID,
          localDate: today(),
          title: "Aerobic run",
          sport: "Running",
          activities: UNCHANGED_ACTIVITIES,
        }),
      );

      expect(result).toMatchObject({
        status: "saved",
        message: "Nothing had changed, so nothing was saved.",
      });
      expect(applyChangeSet).not.toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan");
      expect(recordAcceptedMock).toHaveBeenCalledOnce();
    });
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
  // `ActivityEditor` always renders this, so a form without it is not one the
  // surface can produce. Tests that care about the list override it.
  formData.set("activities", "[]");
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
