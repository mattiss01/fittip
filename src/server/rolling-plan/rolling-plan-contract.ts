import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanRuleError,
  RollingPlanValidationError,
} from "./rolling-plan";

export type RollingPlanContractSubject = {
  plan: RollingPlan;
  /**
   * Owner-local today, as the adapter under test derives it. Every date in
   * this contract is relative to it, because the past boundary is defined
   * against it and a fixed literal would silently stop testing the rule.
   */
  today: string;
  dispose?: () => Promise<void>;
};

export function registerRollingPlanContract(
  adapterName: string,
  createSubject: () => Promise<RollingPlanContractSubject>,
) {
  describe(`rolling plan module through ${adapterName}`, () => {
    let subject: RollingPlanContractSubject | undefined;

    beforeEach(async () => {
      subject = await createSubject();
    });

    afterEach(async () => {
      await subject?.dispose?.();
      subject = undefined;
    });

    it("applies add, edit, move, lock, and cancellation through bounded reads", async () => {
      const { plan, day } = requireSubject(subject);
      const sessionId = randomUUID();
      await plan.applyChangeSet(changeSet([add(sessionId, day(1), 0)]), 0);

      const added = await plan.getPlanSlice(day(1), day(1));
      expect(added).toMatchObject({
        revision: 1,
        recoveryDates: [],
        sessions: [
          {
            id: sessionId,
            title: "Aerobic run",
            activities: [
              {
                name: "Easy running",
                measurementMode: "duration_intensity",
              },
            ],
          },
        ],
      });

      await plan.applyChangeSet(
        changeSet([
          {
            operation: "edit",
            sessionId,
            session: {
              title: "Long aerobic run",
              sport: "Running",
              expectedDurationMinutes: 75,
              activities: [],
            },
          },
        ]),
        1,
      );
      await plan.applyChangeSet(
        changeSet([
          {
            operation: "move",
            sessionId,
            localDate: day(2),
            position: 1,
          },
        ]),
        2,
      );
      await plan.applyChangeSet(
        changeSet([{ operation: "set_lock", sessionId, isLocked: true }]),
        3,
      );
      await plan.applyChangeSet(
        changeSet([{ operation: "cancel", sessionId }]),
        4,
      );

      expect(await plan.getPlanSlice(day(1), day(1))).toEqual({
        planId: expect.any(String),
        revision: 5,
        sessions: [],
        recoveryDates: [],
      });
      expect(await plan.getPlanSlice(day(2), day(2))).toEqual({
        planId: expect.any(String),
        revision: 5,
        recoveryDates: [],
        sessions: [
          expect.objectContaining({
            id: sessionId,
            title: "Long aerobic run",
            position: 1,
            isLocked: true,
            status: "cancelled",
            cancelledAt: expect.any(String),
          }),
        ],
      });
    });

    it("rolls back every subchange when one grouped change is invalid", async () => {
      const { plan, day } = requireSubject(subject);
      await expect(
        plan.applyChangeSet(
          changeSet([
            add(randomUUID(), day(3), 0),
            {
              operation: "move",
              sessionId: randomUUID(),
              localDate: day(4),
              position: 0,
            },
          ]),
          0,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      expect(await plan.getPlanSlice(day(0), day(30))).toEqual({
        planId: null,
        revision: 0,
        sessions: [],
        recoveryDates: [],
      });
    });

    it("replays identical requests and rejects stale revisions", async () => {
      const { plan, day } = requireSubject(subject);
      const request = changeSet([add(randomUUID(), day(5), 0)]);
      const applied = await plan.applyChangeSet(request, 0);
      await expect(plan.applyChangeSet(request, 0)).resolves.toMatchObject({
        changeSetId: applied.changeSetId,
        planRevision: 1,
        result: "replayed",
      });
      await expect(
        plan.applyChangeSet(changeSet([add(randomUUID(), day(6), 0)]), 0),
      ).rejects.toThrow(RollingPlanConflictError);
      expect(await plan.getPlanSlice(day(0), day(30))).toMatchObject({
        revision: 1,
        sessions: [{ localDate: day(5) }],
      });
    });

    it("swaps two occupied positions using final-state uniqueness", async () => {
      const { plan, day } = requireSubject(subject);
      const firstId = randomUUID();
      const secondId = randomUUID();
      await plan.applyChangeSet(
        changeSet([
          add(firstId, day(7), 0, "First"),
          add(secondId, day(7), 1, "Second"),
        ]),
        0,
      );
      await plan.applyChangeSet(
        changeSet([
          {
            operation: "move",
            sessionId: firstId,
            localDate: day(7),
            position: 1,
          },
          {
            operation: "move",
            sessionId: secondId,
            localDate: day(7),
            position: 0,
          },
        ]),
        1,
      );
      expect(await positions(plan, day(7))).toEqual([
        [secondId, 0],
        [firstId, 1],
      ]);
    });

    it("adds into an occupied position before moving the old session", async () => {
      const { plan, day } = requireSubject(subject);
      const oldId = randomUUID();
      const newId = randomUUID();
      await plan.applyChangeSet(changeSet([add(oldId, day(8), 0, "Old")]), 0);
      await plan.applyChangeSet(
        changeSet([
          add(newId, day(8), 0, "New"),
          {
            operation: "move",
            sessionId: oldId,
            localDate: day(8),
            position: 1,
          },
        ]),
        1,
      );
      expect(await positions(plan, day(8))).toEqual([
        [newId, 0],
        [oldId, 1],
      ]);
    });

    it("plans owner-local today but refuses any date before it", async () => {
      const { plan, day } = requireSubject(subject);
      await expect(
        plan.applyChangeSet(changeSet([add(randomUUID(), day(-1), 0)]), 0),
      ).rejects.toThrow(RollingPlanRuleError);
      await expect(
        plan.applyChangeSet(
          changeSet([
            {
              operation: "set_recovery_day",
              localDate: day(-1),
              isRecoveryDay: true,
            },
          ]),
          0,
        ),
      ).rejects.toThrow(RollingPlanRuleError);

      const todaySession = randomUUID();
      await plan.applyChangeSet(
        changeSet([add(todaySession, day(0), 0, "Today")]),
        0,
      );
      await expect(
        plan.applyChangeSet(
          changeSet([
            {
              operation: "move",
              sessionId: todaySession,
              localDate: day(-1),
              position: 0,
            },
          ]),
          1,
        ),
      ).rejects.toThrow(RollingPlanRuleError);
      expect(await plan.getPlanSlice(day(0), day(0))).toMatchObject({
        revision: 1,
        sessions: [{ id: todaySession }],
      });
    });

    it("sets and clears a recovery day label beside the sessions", async () => {
      const { plan, day } = requireSubject(subject);
      const sessionId = randomUUID();
      await plan.applyChangeSet(
        changeSet([
          add(sessionId, day(1), 0),
          {
            operation: "set_recovery_day",
            localDate: day(2),
            isRecoveryDay: true,
          },
        ]),
        0,
      );
      expect(await plan.getPlanSlice(day(0), day(30))).toMatchObject({
        revision: 1,
        recoveryDates: [day(2)],
        sessions: [{ id: sessionId, localDate: day(1) }],
      });

      // Labelling an already labelled date changes nothing, so it is not a change.
      await expect(
        plan.applyChangeSet(
          changeSet([
            {
              operation: "set_recovery_day",
              localDate: day(2),
              isRecoveryDay: true,
            },
          ]),
          1,
        ),
      ).rejects.toThrow(RollingPlanValidationError);

      await plan.applyChangeSet(
        changeSet([
          {
            operation: "set_recovery_day",
            localDate: day(2),
            isRecoveryDay: false,
          },
        ]),
        1,
      );
      expect(await plan.getPlanSlice(day(0), day(30))).toMatchObject({
        revision: 2,
        recoveryDates: [],
        sessions: [{ id: sessionId }],
      });
    });

    it("holds one date to ten active sessions and never counts a label", async () => {
      const { plan, day } = requireSubject(subject);
      const ids = Array.from({ length: 10 }, () => randomUUID());
      await plan.applyChangeSet(
        changeSet(ids.map((id, index) => add(id, day(9), index))),
        0,
      );

      await expect(
        plan.applyChangeSet(
          changeSet([add(randomUUID(), day(9), 10, "Eleventh")]),
          1,
        ),
      ).rejects.toThrow(RollingPlanRuleError);

      // The cap judges the state the whole change set leaves behind.
      await plan.applyChangeSet(
        changeSet([
          { operation: "cancel", sessionId: ids[0] },
          add(randomUUID(), day(9), 10, "Eleventh"),
          {
            operation: "set_recovery_day",
            localDate: day(9),
            isRecoveryDay: true,
          },
        ]),
        1,
      );
      const slice = await plan.getPlanSlice(day(9), day(9));
      expect(slice.recoveryDates).toEqual([day(9)]);
      expect(
        slice.sessions.filter((session) => session.status === "active"),
      ).toHaveLength(10);
    });
  });
}

function requireSubject(subject: RollingPlanContractSubject | undefined) {
  if (!subject) throw new Error("Rolling plan contract setup failed.");
  const { plan, today } = subject;
  return { plan, day: (offset: number) => shiftDate(today, offset) };
}

function shiftDate(isoDate: string, offset: number) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

function changeSet(changes: unknown[]) {
  return {
    idempotencyKey: randomUUID(),
    provenance: "owner_manual",
    changes,
  };
}

function add(
  sessionId: string,
  localDate: string,
  position: number,
  title = "Aerobic run",
) {
  return {
    operation: "add",
    sessionId,
    session: {
      localDate,
      position,
      title,
      sport: "Running",
      expectedDurationMinutes: 60,
      isLocked: false,
      activities: [
        {
          position: 0,
          name: "Easy running",
          sport: "Running",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 60, intensity: "easy" },
          isLocked: false,
        },
      ],
    },
  };
}

async function positions(plan: RollingPlan, localDate: string) {
  const slice = await plan.getPlanSlice(localDate, localDate);
  return slice.sessions.map((session) => [session.id, session.position]);
}
