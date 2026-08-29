import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CompletionConflictError,
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
        create(planSessionId, day(1)),
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
        create(planSessionId, day(2)),
      );

      await expect(
        completions.applyChange({
          operation: "edit",
          completionId,
          expectedRevision: 0,
          completion: {
            status: "partially_completed",
            actualLocalDate: day(2),
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
      expect(await completions.list(day(2), day(2))).toHaveLength(1);
    });

    it("refuses a write at a revision the owner no longer holds", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(3), "Aerobic run");
      const { completionId } = await completions.applyChange(
        create(planSessionId, day(3)),
      );
      await completions.applyChange({
        operation: "edit",
        completionId,
        expectedRevision: 0,
        completion: { status: "skipped", actualLocalDate: day(3) },
      });

      await expect(
        completions.applyChange({
          operation: "edit",
          completionId,
          expectedRevision: 0,
          completion: { status: "completed", actualLocalDate: day(3) },
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
          completion: { status: "completed", actualLocalDate: day(3) },
        }),
      ).rejects.toThrow(CompletionConflictError);
    });

    it("keeps at most one completion per planned session", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const planSessionId = await addPlanSession(day(4), "Aerobic run");
      await completions.applyChange(create(planSessionId, day(4)));

      await expect(
        completions.applyChange(create(planSessionId, day(4))),
      ).rejects.toThrow(CompletionValidationError);
      expect(await completions.list(day(4), day(4))).toHaveLength(1);
    });

    it("records an unplanned completion with nothing to compare against", async () => {
      const { completions, day } = requireSubject(subject);
      const { completionId } = await completions.applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: day(5),
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
            actualLocalDate: day(6),
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
            actualLocalDate: day(6),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      await expect(
        completions.applyChange({
          operation: "create",
          completion: {
            status: "completed",
            actualLocalDate: day(6),
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
            actualLocalDate: day(6),
            activities: [],
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
      expect(await completions.list(day(6), day(6))).toEqual([]);
    });

    it("reads history newest first inside the window asked for", async () => {
      const { completions, addPlanSession, day } = requireSubject(subject);
      const earlier = await addPlanSession(day(7), "Earlier");
      const later = await addPlanSession(day(9), "Later");
      await completions.applyChange(create(earlier, day(7)));
      await completions.applyChange(create(later, day(9)));

      expect(
        (await completions.list(day(7), day(9))).map(
          (completion) => completion.actualLocalDate,
        ),
      ).toEqual([day(9), day(7)]);
      expect(
        (await completions.list(day(8), day(9))).map(
          (completion) => completion.actualLocalDate,
        ),
      ).toEqual([day(9)]);
      expect(await completions.list(day(10), day(11))).toEqual([]);
      expect(
        await completions.get("75000000-0000-4000-8000-0000000000fe"),
      ).toBeNull();
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
