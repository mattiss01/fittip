import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CompletionConflictError,
  CompletionDuplicateError,
  CompletionFutureDateError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
  type CompletionLog,
} from "./completion-log";

export type CompletionLogContractSubject = {
  completions: CompletionLog;
  /**
   * Owner-local today, as the adapter under test derives it. Every date in
   * this contract is relative to it, because the plan side refuses a past date
   * and a fixed literal would silently stop testing against a real plan.
   */
  today: string;
  /**
   * Adds a planned session to the plan this log measures against and returns
   * its id. Required, because the one behavior both adapters must agree on
   * most precisely is what happens to a completion when that session changes.
   */
  addPlanSession: (localDate: string, title: string) => Promise<string>;
  /** Rewrites that planned session afterwards, as replanning does. */
  editPlanSession: (sessionId: string, title: string) => Promise<void>;
  /** Removes the owner's stored zone, as nulling `profiles.timezone_name` would. */
  clearTimezone: () => Promise<void>;
  dispose?: () => Promise<void>;
};

export function registerCompletionLogContract(
  adapterName: string,
  createSubject: () => Promise<CompletionLogContractSubject>,
) {
  describe(`completion log through ${adapterName}`, () => {
    let subject: CompletionLogContractSubject | undefined;

    beforeEach(async () => {
      subject = await createSubject();
    });

    afterEach(async () => {
      await subject?.dispose?.();
      subject = undefined;
    });

    it("records what happened and copies the planned session into it", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(0), "Aerobic run");

      const receipt = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      expect(receipt).toMatchObject({ revision: 0, result: "created" });

      const stored = await completions.get(receipt.completionId);
      expect(stored).toMatchObject({
        planSessionId,
        status: "completed",
        actualLocalDate: day(0),
        durationMinutes: 58,
        perceivedEffort: 6,
        feeling: "good",
        painReported: false,
        revision: 0,
      });
      expect(stored?.plannedSnapshot).toMatchObject({
        localDate: day(0),
        title: "Aerobic run",
        sport: "Running",
        status: "active",
        isLocked: false,
        seriesId: null,
        occurrenceDate: null,
      });
      expect(stored?.plannedSnapshot?.activities).toEqual([
        {
          position: 0,
          name: "Easy running",
          sport: "Running",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 40, intensity: "easy" },
        },
      ]);
      expect(stored?.activities).toEqual([
        {
          position: 0,
          name: "Easy running",
          sport: "Running",
          measurementMode: "duration_intensity",
          actualMeasurement: { duration_minutes: 58, intensity: "easy" },
        },
      ]);
      expect(stored?.timezoneName).toEqual(expect.any(String));
    });

    it("never lets the plan side rewrite what it was measured against", async () => {
      const { completions, addPlanSession, editPlanSession, day } =
        requireSubject(subject);
      const planSessionId = await addPlanSession(day(1), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      const before = await completions.get(completionId);

      await editPlanSession(planSessionId, "Something else entirely");

      expect((await completions.get(completionId))?.plannedSnapshot).toEqual(
        before?.plannedSnapshot,
      );
    });

    it("corrects a completion in place, keeping one record and no trail", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(2), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(0)),
      );

      await expect(
        completions.applyChange({
          operation: "edit",
          completionId,
          expectedRevision: 0,
          completion: {
            status: "partially_completed",
            actualLocalDate: day(0),
            durationMinutes: 41,
            note: "Stopped early.",
          },
        }),
      ).resolves.toMatchObject({ revision: 1, result: "updated" });

      const corrected = await completions.get(completionId);
      expect(corrected).toMatchObject({
        status: "partially_completed",
        durationMinutes: 41,
        note: "Stopped early.",
        revision: 1,
      });
      // An edit replaces the whole record rather than merging into it, and it
      // never touches the activity or planned snapshots beside it.
      expect(corrected?.perceivedEffort).toBeUndefined();
      expect(corrected?.feeling).toBeUndefined();
      expect(corrected?.activities).toHaveLength(1);
      expect(await completions.list(day(0), day(0))).toHaveLength(1);
    });

    it("refuses a write at a revision the owner no longer holds", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(3), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      await completions.applyChange({
        operation: "edit",
        completionId,
        expectedRevision: 0,
        completion: { status: "skipped", actualLocalDate: day(0) },
      });

      await expect(
        completions.applyChange({
          operation: "edit",
          completionId,
          expectedRevision: 0,
          completion: { status: "completed", actualLocalDate: day(0) },
        }),
      ).rejects.toThrow(CompletionConflictError);
      expect((await completions.get(completionId))?.status).toBe("skipped");

      // A completion that does not exist is reported the same way, because
      // saying anything else would say whether it belongs to someone.
      await expect(
        completions.applyChange({
          operation: "edit",
          completionId: "75000000-0000-4000-8000-0000000000ff",
          expectedRevision: 0,
          completion: { status: "completed", actualLocalDate: day(0) },
        }),
      ).rejects.toThrow(CompletionConflictError);
    });

    it("keeps at most one completion per planned session", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(4), "Aerobic run");
      await completions.applyChange(create(planSessionId, day(0)));

      // Its own error: nothing about the outcome, the date, or the numbers the
      // owner entered is wrong, so the surface must be able to say which
      // refusal this is.
      await expect(
        completions.applyChange(create(planSessionId, day(0))),
      ).rejects.toThrow(CompletionDuplicateError);
      expect(await completions.list(day(0), day(0))).toHaveLength(1);
    });

    it("records an unplanned completion with nothing to compare against", async () => {
      const { completions, day } = requireSubject(subject);
      const { completionId } = await completions.applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: day(0),
          durationMinutes: 30,
          activities: [],
        },
      });

      expect(await completions.get(completionId)).toMatchObject({
        planSessionId: null,
        plannedSnapshot: null,
        status: "unplanned",
      });
    });

    it("refuses a status the vocabulary does not admit", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(6), "Aerobic run");

      // `rest` is not a completion: a recovery intention is a planning label.
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "rest",
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      // `unplanned` and "names a planned session" exclude each other, and a
      // `replaced` completion has to say what was done instead.
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            planSessionId,
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "completed",
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "replaced",
            planSessionId,
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      expect(await completions.list(day(0), day(0))).toEqual([]);
    });

    it("reads history newest first inside the window asked for", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      // The plan side refuses a past date and a completion refuses a future
      // one, so a planned session lives ahead of today and what was logged
      // against it never does.
      const earlier = await addPlanSession(day(7), "Earlier");
      const later = await addPlanSession(day(9), "Later");
      await completions.applyChange(create(earlier, day(-2)));
      await completions.applyChange(create(later, day(0)));

      expect(
        (await completions.list(day(-2), day(0))).map(
          (completion) => completion.actualLocalDate,
        ),
      ).toEqual([day(0), day(-2)]);
      expect(
        (await completions.list(day(-1), day(0))).map(
          (completion) => completion.actualLocalDate,
        ),
      ).toEqual([day(0)]);
      expect(await completions.list(day(1), day(2))).toEqual([]);
      expect(
        await completions.get("75000000-0000-4000-8000-0000000000fe"),
      ).toBeNull();
    });

    it("refuses training dated after the owner's today", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(1), "Tomorrow's run");

      // Time passing is not completion, and the argument does not depend on
      // whether the session was planned.
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            actualLocalDate: day(1),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionFutureDateError);
      await expect(
        completions.applyChange(create(planSessionId, day(1))),
      ).rejects.toThrow(CompletionFutureDateError);
      expect(await completions.list(day(1), day(1))).toEqual([]);

      // A planned session still ahead of today can be logged as done today.
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      await expect(
        completions.applyChange({
          operation: "edit",
          completionId,
          expectedRevision: 0,
          completion: { status: "completed", actualLocalDate: day(1) },
        }),
      ).rejects.toThrow(CompletionFutureDateError);
      expect((await completions.get(completionId))?.actualLocalDate).toBe(
        day(0),
      );
    });

    it("corrects the activities of unplanned training", async () => {
      const { completions, day } = requireSubject(subject);
      const { completionId } = await completions.applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: day(0),
          activities: [
            {
              position: 0,
              name: "Tepmo run",
              sport: "Running",
              measurementMode: "duration_intensity",
            },
          ],
        },
      });

      // Naming no activities leaves the ones already written alone.
      await completions.applyChange({
        operation: "edit",
        completionId,
        expectedRevision: 0,
        completion: { status: "unplanned", actualLocalDate: day(0) },
      });
      expect((await completions.get(completionId))?.activities).toHaveLength(1);
      expect((await completions.get(completionId))?.activities[0]?.name).toBe(
        "Tepmo run",
      );

      await completions.applyChange({
        operation: "edit",
        completionId,
        expectedRevision: 1,
        completion: {
          status: "unplanned",
          actualLocalDate: day(0),
          activities: [
            {
              position: 0,
              name: "Tempo run",
              sport: "Trail running",
              measurementMode: "duration_intensity",
            },
          ],
        },
      });
      expect((await completions.get(completionId))?.activities).toEqual([
        {
          position: 0,
          name: "Tempo run",
          sport: "Trail running",
          measurementMode: "duration_intensity",
        },
      ]);
    });

    // Inverted by A4bc. M3-23 refused this, reading the actual list as though
    // it were the snapshot; what a planned log was measured against is the
    // snapshot, and correcting what was done must leave it exactly as it was.
    it("corrects a planned log's actuals and never what it was measured against", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(0), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      const before = (await completions.get(completionId))?.plannedSnapshot;

      await completions.applyChange({
        operation: "edit",
        completionId,
        expectedRevision: 0,
        completion: {
          status: "completed",
          actualLocalDate: day(0),
          activities: [
            {
              position: 0,
              name: "Strides",
              sport: "Running",
              measurementMode: "unmeasured",
            },
            {
              position: 1,
              plannedPosition: 0,
              name: "Easy running",
              sport: "Running",
              measurementMode: "duration_intensity",
              actualMeasurement: { duration_minutes: 50 },
            },
          ],
        },
      });

      const after = await completions.get(completionId);
      expect(after?.plannedSnapshot).toEqual(before);
      expect(after?.activities).toEqual([
        {
          position: 0,
          name: "Strides",
          sport: "Running",
          measurementMode: "unmeasured",
        },
        {
          position: 1,
          plannedPosition: 0,
          name: "Easy running",
          sport: "Running",
          measurementMode: "duration_intensity",
          actualMeasurement: { duration_minutes: 50 },
        },
      ]);
    });

    it("lets an actual answer only a planned activity of its own snapshot", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(0), "Aerobic run");
      const draft = create(planSessionId, day(0));
      const answering = (plannedPosition: number) => ({
        position: 0,
        plannedPosition,
        name: "Easy running",
        sport: "Running",
        measurementMode: "unmeasured",
      });

      // The snapshot holds one activity, at position 0.
      await expect(
        completions.applyChange({
          ...draft,
          completion: { ...draft.completion, activities: [answering(3)] },
        }),
      ).rejects.toThrow(CompletionValidationError);
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            actualLocalDate: day(0),
            title: "Easy running",
            sport: "Running",
            activities: [answering(0)],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);

      await completions.applyChange({
        ...draft,
        completion: { ...draft.completion, activities: [answering(0)] },
      });
      expect(
        (await completions.findByPlanSession(planSessionId))?.activities[0]
          ?.plannedPosition,
      ).toBe(0);
    });

    it("gives every log a name of its own, and keeps it until it is changed", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(0), "Aerobic run");

      // A create that states no name is named from its planned session.
      const planned = await completions.applyChange(
        create(planSessionId, day(0)),
      );
      expect(await completions.get(planned.completionId)).toMatchObject({
        title: "Aerobic run",
        sport: "Running",
      });

      await completions.applyChange({
        operation: "edit",
        completionId: planned.completionId,
        expectedRevision: 0,
        completion: {
          status: "completed",
          actualLocalDate: day(0),
          title: "  Hill reps instead ",
          sport: "Trail running",
        },
      });
      // An edit that states no name leaves it alone.
      await completions.applyChange({
        operation: "edit",
        completionId: planned.completionId,
        expectedRevision: 1,
        completion: {
          status: "completed",
          actualLocalDate: day(0),
          durationMinutes: 50,
        },
      });
      const renamed = await completions.get(planned.completionId);
      expect(renamed).toMatchObject({
        title: "Hill reps instead",
        sport: "Trail running",
      });
      // The plan it answers to is untouched by the rename.
      expect(renamed?.plannedSnapshot?.title).toBe("Aerobic run");

      // Unplanned training states its own, and has no activities to hold it.
      const unplanned = await completions.applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: day(0),
          title: "Sunrise swim",
          sport: "Swimming",
          activities: [],
        },
      });
      expect(await completions.get(unplanned.completionId)).toMatchObject({
        title: "Sunrise swim",
        sport: "Swimming",
        activities: [],
      });

      // Half a name is not a name.
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            actualLocalDate: day(0),
            title: "Rowing",
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
    });

    it("replaces a planned session with training written in the same save", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const tempo = await addPlanSession(day(0), "Tempo run");
      // Tomorrow: the Postgres harness adds every session at position 0.
      const easy = await addPlanSession(day(1), "Easy run");
      const replaced = (planSessionId: string, pointer: object) => ({
        operation: "create",
        completion: {
          planSessionId,
          status: "replaced",
          actualLocalDate: day(0),
          activities: [],
          ...pointer,
        },
      });

      const first = await completions.applyChange(
        replaced(tempo, {
          replacement: {
            title: "Hill ride",
            sport: "Cycling",
            durationMinutes: 70,
            activities: [],
          },
        }),
      );
      const logged = await completions.get(first.completionId);
      const ride = logged?.replacedBy;
      expect(ride).toMatchObject({ title: "Hill ride", sport: "Cycling" });
      expect(logged?.durationMinutes).toBeUndefined();
      expect(await completions.get(ride!.completionId)).toMatchObject({
        status: "unplanned",
        planSessionId: null,
        title: "Hill ride",
        durationMinutes: 70,
      });

      // The same ride may stand for a second session too.
      const second = await completions.applyChange(
        replaced(easy, { replacedByCompletionId: ride!.completionId }),
      );
      expect(
        (await completions.get(second.completionId))?.replacedBy?.completionId,
      ).toBe(ride!.completionId);

      // The ride knows what it stood in for. Both were logged on one day, so
      // their order falls to the ids and is not asserted.
      const replaces = (await completions.get(ride!.completionId))?.replaces;
      expect(replaces).toHaveLength(2);
      expect(replaces).toEqual(
        expect.arrayContaining([
          { completionId: first.completionId, title: "Tempo run" },
          { completionId: second.completionId, title: "Easy run" },
        ]),
      );

      // Corrected away from replaced, a log points nowhere; the ride stays.
      await completions.applyChange({
        operation: "edit",
        completionId: first.completionId,
        expectedRevision: 0,
        completion: { status: "completed", actualLocalDate: day(0) },
      });
      expect((await completions.get(first.completionId))?.replacedBy).toBe(
        null,
      );
      expect(await completions.get(ride!.completionId)).not.toBe(null);
    });

    it("points only at unplanned training, and writes both logs or neither", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const tempo = await addPlanSession(day(0), "Tempo run");
      // Tomorrow: the Postgres harness adds every session at position 0.
      const easy = await addPlanSession(day(1), "Easy run");
      const planned = await completions.applyChange(create(tempo, day(0)));

      // A planned log cannot stand for what was done instead, and a missing
      // one is refused the same way.
      for (const pointer of [
        planned.completionId,
        "75000000-0000-4000-8000-00000000dead",
      ]) {
        await expect(
          completions.applyChange({
            operation: "create",
            completion: {
              planSessionId: easy,
              status: "replaced",
              actualLocalDate: day(0),
              activities: [],
              replacedByCompletionId: pointer,
            },
          }),
        ).rejects.toThrow(CompletionValidationError);
      }

      // Replacing a session that already has a log is refused, and the ride
      // written for it is taken back with it.
      const before = (await completions.list(day(-1), day(0))).length;
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            planSessionId: tempo,
            status: "replaced",
            actualLocalDate: day(0),
            activities: [],
            replacement: { title: "Swim", sport: "Swimming", activities: [] },
          },
        }),
      ).rejects.toThrow(CompletionDuplicateError);
      expect((await completions.list(day(-1), day(0))).length).toBe(before);

      // Replaced must point somewhere, and nothing else may.
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            planSessionId: easy,
            status: "replaced",
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
    });

    it("finds what a planned session already carries, whatever day it was logged on", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(3), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(-1)),
      );

      // The surface looking at day 3 cannot see this through `list`, which is
      // bounded by the actual date - which is why the refusal used to be a
      // surprise.
      expect(await completions.list(day(3), day(3))).toEqual([]);
      expect(await completions.findByPlanSession(planSessionId)).toMatchObject({
        id: completionId,
        actualLocalDate: day(-1),
      });
      expect(
        await completions.findByPlanSession(
          "75000000-0000-4000-8000-0000000000fd",
        ),
      ).toBeNull();
    });

    it("finds what many planned sessions carry in one read, and omits the rest", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const early = await addPlanSession(day(3), "Aerobic run");
      const open = await addPlanSession(day(4), "Strides");
      const { completionId } = await completions.applyChange(
        create(early, day(-1)),
      );

      const found = await completions.findByPlanSessions([early, open]);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        id: completionId,
        planSessionId: early,
        actualLocalDate: day(-1),
      });
      expect(await completions.findByPlanSessions([])).toEqual([]);
    });

    it("refuses to anchor a local date with no stored zone", async () => {
      const { completions, clearTimezone, day } = requireSubject(subject);
      await clearTimezone();

      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            actualLocalDate: day(0),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionTimezoneRequiredError);
    });
  });
}

function requireSubject(subject: CompletionLogContractSubject | undefined) {
  if (!subject) throw new Error("Completion log contract setup failed.");
  const { completions, today, addPlanSession, editPlanSession, clearTimezone } =
    subject;
  return {
    completions,
    addPlanSession,
    editPlanSession,
    clearTimezone,
    day: (offset: number) => shiftDate(today, offset),
  };
}

function shiftDate(isoDate: string, offset: number) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

function create(planSessionId: string, actualLocalDate: string) {
  return {
    operation: "create",
    completion: {
      planSessionId,
      status: "completed",
      actualLocalDate,
      durationMinutes: 58,
      perceivedEffort: 6,
      feeling: "good",
      note: "Legs came round after twenty minutes.",
      activities: [
        {
          position: 0,
          name: "Easy running",
          sport: "Running",
          measurementMode: "duration_intensity",
          actualMeasurement: { duration_minutes: 58, intensity: "easy" },
        },
      ],
    },
  };
}

/** The one planned session shape this contract measures completions against. */
export const CONTRACT_PLANNED_SESSION = {
  position: 0,
  title: "Aerobic run",
  sport: "Running",
  expectedDurationMinutes: 60,
  isLocked: false,
  activities: [
    {
      position: 0,
      name: "Easy running",
      sport: "Running",
      measurementMode: "duration_intensity" as const,
      target: { duration_minutes: 40, intensity: "easy" as const },
    },
  ],
};
