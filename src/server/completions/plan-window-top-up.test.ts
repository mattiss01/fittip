import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isoDateInTimezone } from "@/lib/date/local-date";
import { InMemoryRollingPlanAdapter } from "@/server/rolling-plan/in-memory-rolling-plan-adapter";
import {
  RollingPlan,
  RollingPlanConflictError,
  type ParsedPlanSlice,
  type RollingPlanAdapter,
  type RollingPlanChangeSet,
} from "@/server/rolling-plan/rolling-plan";

import { readPlanWindowToppedUp } from "./plan-window-top-up";

const TIMEZONE = "Europe/Berlin";
const NOW = new Date("2026-08-17T09:30:00.000Z");
const TODAY = isoDateInTimezone(NOW, TIMEZONE);

function day(offset: number) {
  const shifted = new Date(`${TODAY}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

/** Another tab has already taken the revision this read saw. */
class LosingTopUpAdapter implements RollingPlanAdapter {
  constructor(private readonly inner: RollingPlanAdapter) {}

  getPlanSlice(input: ParsedPlanSlice) {
    return this.inner.getPlanSlice(input);
  }

  listSeries() {
    return this.inner.listSeries();
  }

  applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ) {
    return this.inner.applyChangeSet(changeSet, expectedPlanRevision);
  }

  async materializeSeries(): Promise<never> {
    throw new RollingPlanConflictError();
  }
}

function everyThirdDay() {
  return {
    idempotencyKey: randomUUID(),
    provenance: "owner_manual",
    changes: [
      {
        operation: "add_series",
        seriesId: randomUUID(),
        series: {
          frequency: "daily",
          intervalCount: 3,
          startDate: day(0),
          title: "Club session",
          sport: "Running",
          activities: [],
        },
      },
    ],
  };
}

async function planWithSeries() {
  const adapter = new InMemoryRollingPlanAdapter({
    timezoneName: TIMEZONE,
    clock: () => NOW,
  });
  const plan = new RollingPlan(adapter);
  await plan.applyChangeSet(everyThirdDay(), 0);
  return { adapter, plan };
}

describe("plan window top-up before a non-Plan read", () => {
  it("writes the occurrences the window was missing and returns them", async () => {
    const { plan } = await planWithSeries();
    expect((await plan.getPlanSlice(day(0), day(13))).sessions).toHaveLength(0);

    const window = await readPlanWindowToppedUp(plan, day(0), day(13));

    // The top-up fills the whole thirteen-week window, every third day of
    // it; the read asked for the first fourteen days and gets those.
    expect(window).toMatchObject({
      createdCount: 31,
      skipped: [],
      toppedUp: true,
    });
    expect(window.slice.sessions.map((session) => session.localDate)).toEqual([
      day(0),
      day(3),
      day(6),
      day(9),
      day(12),
    ]);
  });

  it("keeps what an earlier pass wrote when a later pass cannot run", async () => {
    // Two daily series need two passes. The second loses the revision to
    // another tab; the first hundred occurrences are still the owner's.
    const adapter = new InMemoryRollingPlanAdapter({
      timezoneName: TIMEZONE,
      clock: () => NOW,
    });
    const daily = () => ({
      operation: "add_series",
      seriesId: randomUUID(),
      series: {
        frequency: "daily",
        intervalCount: 1,
        startDate: day(0),
        title: "Daily session",
        sport: "Running",
        activities: [],
      },
    });
    await new RollingPlan(adapter).applyChangeSet(
      {
        idempotencyKey: randomUUID(),
        provenance: "owner_manual",
        changes: [daily(), daily()],
      },
      0,
    );
    let calls = 0;
    const secondPassLoses = new RollingPlan({
      getPlanSlice: (input) => adapter.getPlanSlice(input),
      listSeries: () => adapter.listSeries(),
      applyChangeSet: (changeSet, revision) =>
        adapter.applyChangeSet(changeSet, revision),
      materializeSeries: async (key, revision) => {
        calls += 1;
        if (calls > 1) throw new RollingPlanConflictError();
        return adapter.materializeSeries(key, revision);
      },
    });

    const window = await readPlanWindowToppedUp(
      secondPassLoses,
      day(0),
      day(90),
    );

    expect(window.toppedUp).toBe(true);
    expect(window.createdCount).toBe(100);
    expect(window.slice.sessions).toHaveLength(100);
    // What is still missing is named, never passed off as a full window.
    expect(window.skipped).toHaveLength(82);
  });

  it("costs no revision once the window is already current", async () => {
    const { plan } = await planWithSeries();
    const first = await readPlanWindowToppedUp(plan, day(0), day(13));

    const second = await readPlanWindowToppedUp(plan, day(0), day(13));

    expect(second.createdCount).toBe(0);
    expect(second.slice.revision).toBe(first.slice.revision);
  });

  it("still returns the window when the top-up itself cannot run", async () => {
    const { adapter } = await planWithSeries();
    const losing = new RollingPlan(new LosingTopUpAdapter(adapter));

    const window = await readPlanWindowToppedUp(losing, day(0), day(13));

    expect(window).toMatchObject({
      createdCount: 0,
      skipped: [],
      toppedUp: false,
    });
    expect(window.slice.sessions).toHaveLength(0);
  });
});
