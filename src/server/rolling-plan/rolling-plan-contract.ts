import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
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
  /**
   * Removes the owner's stored zone, as nulling `profiles.timezone_name`
   * would. Required, because the ordering of the zone check against the replay
   * lookup is part of this contract and cannot be exercised without it.
   */
  clearTimezone: () => Promise<void>;
  /**
   * Records a completion against one planned session, as the owner logging
   * training would. Required, because whether a session may still be deleted
   * is decided by whether it carries one, and a refusal proved in only one
   * adapter is not proved.
   */
  completeSession: (sessionId: string) => Promise<void>;
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

    it("deletes a session outright while cancel keeps the one beside it", async () => {
      const { plan, day } = requireSubject(subject);
      const cancelled = randomUUID();
      const deleted = randomUUID();
      await plan.applyChangeSet(
        changeSet([
          add(cancelled, day(1), 0, "Kept"),
          add(deleted, day(1), 1, "Gone"),
        ]),
        0,
      );
      await plan.applyChangeSet(
        changeSet([{ operation: "cancel", sessionId: cancelled }]),
        1,
      );
      await plan.applyChangeSet(
        changeSet([{ operation: "delete", sessionId: deleted }]),
        2,
      );

      const slice = await plan.getPlanSlice(day(1), day(1));
      expect(slice.revision).toBe(3);
      expect(slice.sessions).toEqual([
        expect.objectContaining({ id: cancelled, status: "cancelled" }),
      ]);
    });

    it("deletes a locked session, and a cancelled one, when asked directly", async () => {
      const { plan, day } = requireSubject(subject);
      const locked = randomUUID();
      const cancelled = randomUUID();
      await plan.applyChangeSet(
        changeSet([
          add(locked, day(2), 0, "Locked"),
          add(cancelled, day(2), 1, "Cancelled"),
        ]),
        0,
      );
      await plan.applyChangeSet(
        changeSet([
          { operation: "set_lock", sessionId: locked, isLocked: true },
          { operation: "cancel", sessionId: cancelled },
        ]),
        1,
      );

      // A lock defends a session from a sweep, never from the owner asking for
      // this one session by name.
      await plan.applyChangeSet(
        changeSet([
          { operation: "delete", sessionId: locked },
          { operation: "delete", sessionId: cancelled },
        ]),
        2,
      );
      expect(await plan.getPlanSlice(day(2), day(2))).toMatchObject({
        revision: 3,
        sessions: [],
      });
    });

    it("refuses to delete a session that carries a completion", async () => {
      const { plan, day, completeSession } = requireSubject(subject);
      const sessionId = randomUUID();
      await plan.applyChangeSet(
        changeSet([add(sessionId, day(0), 0, "Logged")]),
        0,
      );
      await completeSession(sessionId);

      const refusal = await plan
        .applyChangeSet(changeSet([{ operation: "delete", sessionId }]), 1)
        .then(
          () => null,
          (thrown: unknown) => thrown,
        );
      expect(refusal).toBeInstanceOf(RollingPlanRuleError);
      expect((refusal as RollingPlanRuleError).reason).toBe(
        "session-completed",
      );
      // The refusal costs the owner nothing: the session is still there and the
      // revision has not moved, so their next change is not stale.
      expect(await plan.getPlanSlice(day(0), day(0))).toMatchObject({
        revision: 1,
        sessions: [expect.objectContaining({ id: sessionId })],
      });
    });

    it("refuses a delete naming no session, and an unknown operation", async () => {
      const { plan, day } = requireSubject(subject);
      const sessionId = randomUUID();
      await plan.applyChangeSet(changeSet([add(sessionId, day(1), 0)]), 0);

      await expect(
        plan.applyChangeSet(
          changeSet([{ operation: "delete", sessionId: randomUUID() }]),
          1,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      // Cancel used to be the fallthrough of the operation chain. An operation
      // nobody recognizes must land nowhere rather than in the branch beside it.
      await expect(
        plan.applyChangeSet(
          changeSet([{ operation: "obliterate", sessionId }]),
          1,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      await expect(
        plan.applyChangeSet(
          changeSet([{ operation: "delete", sessionId, localDate: day(1) }]),
          1,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      expect(await plan.getPlanSlice(day(1), day(1))).toMatchObject({
        revision: 1,
        sessions: [
          expect.objectContaining({ id: sessionId, status: "active" }),
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

    it("checks the stored zone before replaying an earlier change", async () => {
      const { plan, day, clearTimezone } = requireSubject(subject);
      const request = changeSet([add(randomUUID(), day(1), 0)]);
      await plan.applyChangeSet(request, 0);
      await expect(plan.applyChangeSet(request, 0)).resolves.toMatchObject({
        result: "replayed",
      });

      // Without a zone neither rule can be judged, so the refusal comes before
      // the idempotency lookup rather than after it. Both adapters answer the
      // same way, which is only true if they order those two steps the same.
      await clearTimezone();
      await expect(plan.applyChangeSet(request, 0)).rejects.toThrow(
        RollingPlanTimezoneRequiredError,
      );
      await expect(
        plan.applyChangeSet(changeSet([add(randomUUID(), day(2), 0)]), 1),
      ).rejects.toThrow(RollingPlanTimezoneRequiredError);
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

    it("materializes a series into the window and then reports unchanged", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      await plan.applyChangeSet(changeSet([addSeries(seriesId, day(0), 3)]), 0);

      // Creating the rule writes no occurrence. Materialization is its own act,
      // which is what keeps a Plan read from ever performing a write.
      expect(await plan.getPlanSlice(day(0), day(13))).toMatchObject({
        revision: 1,
        sessions: [],
      });

      const first = await plan.materializeSeries(randomUUID(), 1);
      expect(first).toMatchObject({
        result: "applied",
        createdCount: 5,
        planRevision: 2,
        skipped: [],
      });

      const filled = await plan.getPlanSlice(day(0), day(13));
      expect(filled.sessions.map((session) => session.localDate)).toEqual([
        day(0),
        day(3),
        day(6),
        day(9),
        day(12),
      ]);
      expect(
        filled.sessions.every(
          (session) =>
            session.seriesId === seriesId &&
            session.occurrenceDate === session.localDate &&
            session.hasDiverged === false &&
            session.isLocked === false &&
            session.title === "Club session" &&
            session.activities.length === 1,
        ),
      ).toBe(true);

      // Two open tabs both call this. The second must learn it is already
      // current without consuming a revision and without being told it is
      // stale, so a repeat and a repeat at a stale revision answer the same.
      const repeat = await plan.materializeSeries(randomUUID(), 2);
      expect(repeat).toMatchObject({
        result: "unchanged",
        createdCount: 0,
        changeSetId: null,
        planRevision: 2,
      });
      const stale = await plan.materializeSeries(randomUUID(), 0);
      expect(stale).toMatchObject({ result: "unchanged", planRevision: 2 });
      expect(await plan.getPlanSlice(day(0), day(13))).toMatchObject({
        revision: 2,
      });
    });

    it("never revisits an occurrence the owner has changed or cancelled", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      await plan.applyChangeSet(changeSet([addSeries(seriesId, day(0), 3)]), 0);
      await plan.materializeSeries(randomUUID(), 1);
      const [, second, third] = (await plan.getPlanSlice(day(0), day(13)))
        .sessions;

      await plan.applyChangeSet(
        changeSet([
          {
            operation: "edit",
            sessionId: second.id,
            session: {
              title: "Owner changed this",
              sport: "Running",
              activities: [],
            },
          },
          { operation: "cancel", sessionId: third.id },
        ]),
        2,
      );
      expect(await plan.materializeSeries(randomUUID(), 3)).toMatchObject({
        result: "unchanged",
        createdCount: 0,
      });

      const after = await plan.getPlanSlice(day(0), day(13));
      expect(after.sessions).toHaveLength(5);
      expect(
        after.sessions.find((session) => session.id === second.id),
      ).toMatchObject({ title: "Owner changed this", hasDiverged: true });
      expect(
        after.sessions.find((session) => session.id === third.id),
      ).toMatchObject({ status: "cancelled" });
    });

    it("ends a series forward, keeps a locked occurrence, and reports both", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      await plan.applyChangeSet(changeSet([addSeries(seriesId, day(0), 3)]), 0);
      await plan.materializeSeries(randomUUID(), 1);
      const before = (await plan.getPlanSlice(day(0), day(13))).sessions;

      // day(3) is edited and day(6) is locked. Ending from day(3) must delete
      // the edited one with the rest and leave the locked one active.
      await plan.applyChangeSet(
        changeSet([
          {
            operation: "edit",
            sessionId: before[1].id,
            session: { title: "Edited", sport: "Running", activities: [] },
          },
          { operation: "set_lock", sessionId: before[2].id, isLocked: true },
        ]),
        2,
      );

      const ended = await plan.applyChangeSet(
        changeSet([
          { operation: "end_series", seriesId, effectiveDate: day(3) },
        ]),
        3,
      );
      expect(ended.seriesEffects).toEqual([
        {
          seriesId,
          operation: "end_series",
          deleted: 3,
          divergedDeleted: 1,
          lockedKept: 1,
          completedKept: 0,
        },
      ]);

      const after = await plan.getPlanSlice(day(0), day(13));
      expect(after.sessions.map((session) => session.localDate)).toEqual([
        day(0),
        day(6),
      ]);
      expect(after.sessions[1]).toMatchObject({
        id: before[2].id,
        isLocked: true,
        status: "active",
      });
      // The occurrence before the effective date is untouched, field for field.
      expect(after.sessions[0]).toEqual(before[0]);
      expect(await plan.materializeSeries(randomUUID(), 4)).toMatchObject({
        result: "unchanged",
      });
    });

    it("never lengthens a bounded series by ending it from a later date", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      await plan.applyChangeSet(
        changeSet([boundedSeries(seriesId, day(0), day(3))]),
        0,
      );
      await plan.materializeSeries(randomUUID(), 1);
      const before = (await plan.getPlanSlice(day(0), day(13))).sessions;
      expect(before.map((session) => session.localDate)).toEqual([
        day(0),
        day(1),
        day(2),
        day(3),
      ]);

      // Closing a segment that already ends earlier changes nothing, so it is
      // refused. What it must never do is push the end date out to day(7): the
      // sweep only runs from the effective date forward, so the next
      // materialization would fill a gap nothing could take back.
      await expect(
        plan.applyChangeSet(
          changeSet([
            { operation: "end_series", seriesId, effectiveDate: day(8) },
          ]),
          2,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      await plan.materializeSeries(randomUUID(), 2);
      expect(
        (await plan.getPlanSlice(day(0), day(13))).sessions.map(
          (session) => session.localDate,
        ),
      ).toEqual([day(0), day(1), day(2), day(3)]);
    });

    it("never lengthens the predecessor when the split date is later still", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      const successorSeriesId = randomUUID();
      await plan.applyChangeSet(
        changeSet([boundedSeries(seriesId, day(0), day(3))]),
        0,
      );
      await plan.materializeSeries(randomUUID(), 1);

      await plan.applyChangeSet(
        changeSet([
          {
            operation: "edit_series",
            seriesId,
            effectiveDate: day(6),
            successorSeriesId,
            series: { ...seriesTemplate(day(6), 3), title: "Successor" },
          },
        ]),
        2,
      );
      await plan.materializeSeries(randomUUID(), 3);

      const after = (await plan.getPlanSlice(day(0), day(13))).sessions;
      expect(
        after
          .filter((session) => session.seriesId === seriesId)
          .map((session) => session.localDate),
      ).toEqual([day(0), day(1), day(2), day(3)]);
      expect(
        after
          .filter((session) => session.seriesId === successorSeriesId)
          .map((session) => session.localDate),
      ).toEqual([day(6), day(9), day(12)]);
    });

    it("splits a series and leaves every earlier occurrence alone", async () => {
      const { plan, day } = requireSubject(subject);
      const seriesId = randomUUID();
      const successorSeriesId = randomUUID();
      await plan.applyChangeSet(changeSet([addSeries(seriesId, day(0), 3)]), 0);
      await plan.materializeSeries(randomUUID(), 1);
      const before = (await plan.getPlanSlice(day(0), day(13))).sessions;

      await plan.applyChangeSet(
        changeSet([
          {
            operation: "edit_series",
            seriesId,
            effectiveDate: day(6),
            successorSeriesId,
            series: { ...seriesTemplate(day(6), 5), title: "Successor" },
          },
        ]),
        2,
      );

      const split = await plan.getPlanSlice(day(0), day(13));
      expect(split.sessions.map((session) => session.localDate)).toEqual([
        day(0),
        day(3),
      ]);

      await plan.materializeSeries(randomUUID(), 3);
      const filled = await plan.getPlanSlice(day(0), day(13));
      expect(filled.sessions.map((session) => session.localDate)).toEqual([
        day(0),
        day(3),
        day(6),
        day(11),
      ]);
      expect(
        filled.sessions
          .slice(2)
          .every(
            (session) =>
              session.seriesId === successorSeriesId &&
              session.title === "Successor",
          ),
      ).toBe(true);
      // The two occurrences the predecessor already produced still mean what
      // they meant, which is the whole point of an effective-dated successor.
      expect(filled.sessions.slice(0, 2)).toEqual(before.slice(0, 2));
    });
  });
}

function requireSubject(subject: RollingPlanContractSubject | undefined) {
  if (!subject) throw new Error("Rolling plan contract setup failed.");
  const { plan, today, clearTimezone, completeSession } = subject;
  return {
    plan,
    clearTimezone,
    completeSession,
    day: (offset: number) => shiftDate(today, offset),
  };
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

function seriesTemplate(startDate: string, intervalCount: number) {
  return {
    frequency: "daily" as const,
    intervalCount,
    startDate,
    title: "Club session",
    sport: "Running",
    expectedDurationMinutes: 60,
    activities: [
      {
        position: 0,
        name: "Easy running",
        sport: "Running",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 60, intensity: "easy" },
      },
    ],
  };
}

/** An explicitly bounded daily segment, the only shape a clamp can be seen on. */
function boundedSeries(seriesId: string, startDate: string, endDate: string) {
  return {
    operation: "add_series",
    seriesId,
    series: { ...seriesTemplate(startDate, 1), endDate },
  };
}

function addSeries(seriesId: string, startDate: string, intervalCount: number) {
  return {
    operation: "add_series",
    seriesId,
    series: seriesTemplate(startDate, intervalCount),
  };
}

async function positions(plan: RollingPlan, localDate: string) {
  const slice = await plan.getPlanSlice(localDate, localDate);
  return slice.sessions.map((session) => [session.id, session.position]);
}
