import { describe, expect, it } from "vitest";

import {
  dayLoad,
  formatPlannedTime,
  mondayOf,
  phaseOfWeek,
  planWeeks,
  sportKey,
  sportTones,
  weekIndexOf,
} from "./plan-weeks";

describe("plan weeks", () => {
  it("starts on the Monday on or before a date", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-09-30")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
  });

  it("covers the window whole, Monday to Sunday", () => {
    const weeks = planWeeks("2026-09-30", "2026-10-13");

    expect(weeks.map((week) => [week.start, week.end])).toEqual([
      ["2026-09-28", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
    ]);
    expect(weeks[0].days[1]).toEqual({
      date: "2026-09-29",
      past: true,
      beyond: false,
      afterRepeats: false,
    });
    expect(weeks[0].days[2].past).toBe(false);
    expect(weeks[2].days[1]).toMatchObject({
      date: "2026-10-13",
      beyond: false,
    });
    expect(weeks[2].days[2]).toMatchObject({
      date: "2026-10-14",
      beyond: true,
    });
  });

  it("marks the days recurring sessions are not written to, which are still open", () => {
    // Single sessions may sit through 13 October; repeats stop on the 6th.
    const weeks = planWeeks("2026-09-30", "2026-10-13", "2026-10-06");

    expect(weeks[1].days[1]).toMatchObject({
      date: "2026-10-06",
      beyond: false,
      afterRepeats: false,
    });
    expect(weeks[1].days[2]).toMatchObject({
      date: "2026-10-07",
      beyond: false,
      afterRepeats: true,
    });
    // Past the last placeable date a day is closed, whatever else it is.
    expect(weeks[2].days[2]).toMatchObject({
      date: "2026-10-14",
      beyond: true,
      afterRepeats: true,
    });
  });

  it("finds the week holding a date, and falls back to the first", () => {
    const weeks = planWeeks("2026-09-30", "2026-10-13");
    expect(weekIndexOf(weeks, "2026-10-11")).toBe(1);
    expect(weekIndexOf(weeks, "2027-01-01")).toBe(0);
    expect(weekIndexOf(weeks, null)).toBe(0);
  });

  it("formats planned time", () => {
    expect(formatPlannedTime(0)).toBe("0 min");
    expect(formatPlannedTime(45)).toBe("45 min");
    expect(formatPlannedTime(120)).toBe("2 h");
    expect(formatPlannedTime(150)).toBe("2 h 30");
  });

  it("never reads a planned day as empty", () => {
    expect(dayLoad([])).toBe(0);
    expect(dayLoad([null])).toBe(1);
    expect(dayLoad([30])).toBe(1);
    expect(dayLoad([45])).toBe(2);
    expect(dayLoad([60, 90])).toBe(3);
  });

  it("gives each sport its own tone, whatever its case or spacing", () => {
    const tones = sportTones(["Running", "Strength", " running ", "Mobility"]);
    expect(tones.get(sportKey("RUNNING"))).toBe(1);
    expect(tones.get("mobility")).toBe(0);
    expect(tones.get("strength")).toBe(2);
    expect(tones.size).toBe(3);
  });

  it("places a week in the phase holding its Thursday", () => {
    const phases = [
      { title: "A", focus: "", startDate: "2026-09-01", endDate: "2026-09-29" },
      { title: "B", focus: "", startDate: "2026-09-30", endDate: "2026-10-31" },
    ];
    expect(
      phaseOfWeek(phases, { start: "2026-09-28", end: "2026-10-04" })?.title,
    ).toBe("B");
    expect(
      phaseOfWeek(phases, { start: "2026-11-30", end: "2026-12-06" }),
    ).toBeNull();
    // A phase ending mid-week still names the week when none holds Thursday.
    expect(
      phaseOfWeek([phases[0]], { start: "2026-09-28", end: "2026-10-04" })
        ?.title,
    ).toBe("A");
  });
});
