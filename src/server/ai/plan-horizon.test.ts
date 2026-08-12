import { describe, expect, it } from "vitest";

import { CoachAIError } from "@/server/ai/errors";
import {
  derivePlanHorizon,
  planDayCount,
  resolveOwnerToday,
  PLAN_DEFAULT_DAY_COUNT,
  PLAN_MAX_DAY_COUNT,
  PLAN_MIN_DAY_COUNT,
} from "@/server/ai/plan-horizon";

const TODAY = "2026-08-04";

describe("the selected horizon", () => {
  it("covers exactly the requested number of consecutive dates", () => {
    for (const dayCount of [1, 2, 7]) {
      const horizon = derivePlanHorizon({
        today: TODAY,
        startDate: TODAY,
        dayCount,
      });

      expect(horizon.dates).toHaveLength(dayCount);
      expect(horizon.dayCount).toBe(dayCount);
      expect(horizon.startDate).toBe(TODAY);
      expect(new Set(horizon.dates).size).toBe(dayCount);
    }
  });

  it("ends on the last requested date, inclusive", () => {
    expect(
      derivePlanHorizon({ today: TODAY, startDate: TODAY, dayCount: 7 }),
    ).toMatchObject({ startDate: "2026-08-04", endDate: "2026-08-10" });

    // A one-day horizon starts and ends on the same date. It is a legitimate
    // request, not a degenerate week, so nothing may treat it as empty.
    expect(
      derivePlanHorizon({ today: TODAY, startDate: TODAY, dayCount: 1 }),
    ).toMatchObject({ startDate: TODAY, endDate: TODAY });
  });

  it("refuses a day count outside one to seven", () => {
    for (const dayCount of [0, 8, -1, 1.5, Number.NaN]) {
      expect(() =>
        derivePlanHorizon({ today: TODAY, startDate: TODAY, dayCount }),
      ).toThrow(CoachAIError);
    }
    expect(PLAN_MIN_DAY_COUNT).toBe(1);
    expect(PLAN_MAX_DAY_COUNT).toBe(7);
    expect(PLAN_DEFAULT_DAY_COUNT).toBe(7);
  });

  it("refuses a start date before the owner's local today", () => {
    // Decision 2. A proposal never contains a day that has already happened, so
    // the only completed session that can fall inside a horizon is today's.
    expect(() =>
      derivePlanHorizon({
        today: TODAY,
        startDate: "2026-08-03",
        dayCount: 7,
      }),
    ).toThrow(CoachAIError);
  });

  it("allows a later start date the owner chose", () => {
    expect(
      derivePlanHorizon({
        today: TODAY,
        startDate: "2026-08-10",
        dayCount: 2,
      }),
    ).toMatchObject({ startDate: "2026-08-10", endDate: "2026-08-11" });
  });

  it("refuses a date that is well formed and impossible", () => {
    expect(() =>
      derivePlanHorizon({
        today: TODAY,
        startDate: "2026-04-31",
        dayCount: 3,
      }),
    ).toThrow(CoachAIError);
  });
});

/**
 * A calendar date sequence is not affected by daylight saving: adding a day to
 * "2026-10-25" gives "2026-10-26" whether or not the clocks moved that night.
 * The zone decides only which date "today" is, which is why it is used once and
 * the rest is whole-day arithmetic.
 */
describe("daylight saving", () => {
  it("produces consecutive dates across a spring-forward boundary", () => {
    // 8 March 2026, the US spring-forward Sunday.
    expect(
      derivePlanHorizon({
        today: "2026-03-06",
        startDate: "2026-03-06",
        dayCount: 5,
      }).dates,
    ).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });

  it("produces consecutive dates across an autumn fall-back boundary", () => {
    // 25 October 2026, the European fall-back Sunday.
    expect(
      derivePlanHorizon({
        today: "2026-10-23",
        startDate: "2026-10-23",
        dayCount: 5,
      }).dates,
    ).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("derives the owner's local date rather than the server's", () => {
    // 22:30 UTC is already the next day in Auckland and still the same day in
    // New York. A plan built on the wrong one covers the wrong days.
    const instant = new Date("2026-08-04T22:30:00.000Z");

    expect(resolveOwnerToday("Pacific/Auckland", instant)).toBe("2026-08-05");
    expect(resolveOwnerToday("America/New_York", instant)).toBe("2026-08-04");
    expect(resolveOwnerToday("UTC", instant)).toBe("2026-08-04");
  });

  it("refuses rather than falling back to UTC when the zone is unusable", () => {
    // A silent fallback produces a plan for the wrong days on exactly the
    // evenings where it matters.
    for (const zone of [null, undefined, "", "Not/A_Zone"]) {
      expect(() => resolveOwnerToday(zone)).toThrow(CoachAIError);
    }
  });
});

describe("the day count a stored horizon describes", () => {
  it("counts both endpoints", () => {
    expect(planDayCount("2026-08-04", "2026-08-04")).toBe(1);
    expect(planDayCount("2026-08-04", "2026-08-10")).toBe(7);
  });

  it("returns null for a horizon it cannot read", () => {
    expect(planDayCount("2026-08-10", "2026-08-04")).toBeNull();
    expect(planDayCount("not-a-date", "2026-08-04")).toBeNull();
  });
});
