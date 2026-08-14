import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanValidationError,
} from "./rolling-plan";

export type RollingPlanContractSubject = {
  plan: RollingPlan;
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
      const plan = requirePlan(subject);
      const sessionId = randomUUID();
      await plan.applyChangeSet(
        changeSet([add(sessionId, "2026-09-01", 0)]),
        0,
      );

      const added = await plan.getPlanSlice("2026-09-01", "2026-09-01");
      expect(added).toMatchObject({
        revision: 1,
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
            localDate: "2026-09-02",
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

      expect(await plan.getPlanSlice("2026-09-01", "2026-09-01")).toEqual({
        planId: expect.any(String),
        revision: 5,
        sessions: [],
      });
      expect(await plan.getPlanSlice("2026-09-02", "2026-09-02")).toEqual({
        planId: expect.any(String),
        revision: 5,
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
      const plan = requirePlan(subject);
      await expect(
        plan.applyChangeSet(
          changeSet([
            add(randomUUID(), "2026-09-03", 0),
            {
              operation: "move",
              sessionId: randomUUID(),
              localDate: "2026-09-04",
              position: 0,
            },
          ]),
          0,
        ),
      ).rejects.toThrow(RollingPlanValidationError);
      expect(await plan.getPlanSlice("2026-09-01", "2026-09-30")).toEqual({
        planId: null,
        revision: 0,
        sessions: [],
      });
    });

    it("replays identical requests and rejects stale revisions", async () => {
      const plan = requirePlan(subject);
      const request = changeSet([add(randomUUID(), "2026-09-05", 0)]);
      const applied = await plan.applyChangeSet(request, 0);
      await expect(plan.applyChangeSet(request, 0)).resolves.toMatchObject({
        changeSetId: applied.changeSetId,
        planRevision: 1,
        result: "replayed",
      });
      await expect(
        plan.applyChangeSet(changeSet([add(randomUUID(), "2026-09-06", 0)]), 0),
      ).rejects.toThrow(RollingPlanConflictError);
      expect(await plan.getPlanSlice("2026-09-01", "2026-09-30")).toMatchObject(
        { revision: 1, sessions: [{ localDate: "2026-09-05" }] },
      );
    });

    it("swaps two occupied positions using final-state uniqueness", async () => {
      const plan = requirePlan(subject);
      const firstId = randomUUID();
      const secondId = randomUUID();
      await plan.applyChangeSet(
        changeSet([
          add(firstId, "2026-09-07", 0, "First"),
          add(secondId, "2026-09-07", 1, "Second"),
        ]),
        0,
      );
      await plan.applyChangeSet(
        changeSet([
          {
            operation: "move",
            sessionId: firstId,
            localDate: "2026-09-07",
            position: 1,
          },
          {
            operation: "move",
            sessionId: secondId,
            localDate: "2026-09-07",
            position: 0,
          },
        ]),
        1,
      );
      expect(await positions(plan, "2026-09-07")).toEqual([
        [secondId, 0],
        [firstId, 1],
      ]);
    });

    it("adds into an occupied position before moving the old session", async () => {
      const plan = requirePlan(subject);
      const oldId = randomUUID();
      const newId = randomUUID();
      await plan.applyChangeSet(
        changeSet([add(oldId, "2026-09-08", 0, "Old")]),
        0,
      );
      await plan.applyChangeSet(
        changeSet([
          add(newId, "2026-09-08", 0, "New"),
          {
            operation: "move",
            sessionId: oldId,
            localDate: "2026-09-08",
            position: 1,
          },
        ]),
        1,
      );
      expect(await positions(plan, "2026-09-08")).toEqual([
        [newId, 0],
        [oldId, 1],
      ]);
    });
  });
}

function requirePlan(subject: RollingPlanContractSubject | undefined) {
  if (!subject) throw new Error("Rolling plan contract setup failed.");
  return subject.plan;
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
