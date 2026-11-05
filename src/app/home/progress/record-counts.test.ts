import { describe, expect, it } from "vitest";

import {
  countOutcomes,
  countRecord,
  formatMinutes,
  groupByWeek,
  sessionsBySport,
} from "./record-counts";

const log = (
  actualLocalDate: string,
  outcome:
    | "completed"
    | "partially_completed"
    | "skipped"
    | "replaced"
    | "unplanned",
  sport: string | null = "Running",
  durationMinutes: number | null = 30,
) => ({ actualLocalDate, outcome, sport, durationMinutes });

describe("what Progress counts of a month", () => {
  it("counts logs that record training, and only their time", () => {
    expect(
      countRecord([
        log("2026-10-20", "completed", "Running", 45),
        log("2026-10-19", "partially_completed", "Running", 20),
        log("2026-10-18", "unplanned", "Cycling", null),
        log("2026-10-17", "skipped", "Running", null),
        log("2026-10-16", "replaced", "Running", 60),
      ]),
    ).toEqual({ sessions: 3, minutes: 65, withoutDuration: 1 });
  });

  it("counts each outcome present, in the log form's order", () => {
    expect(
      countOutcomes([
        log("2026-10-20", "skipped"),
        log("2026-10-19", "completed"),
        log("2026-10-18", "completed"),
      ]),
    ).toEqual([
      { outcome: "completed", count: 2 },
      { outcome: "skipped", count: 1 },
    ]);
  });

  it("counts sessions per sport in the order the sports are listed", () => {
    expect(
      sessionsBySport(
        [
          log("2026-10-20", "completed", "Cycling"),
          log("2026-10-19", "completed", "Running"),
          log("2026-10-18", "skipped", "Swimming"),
        ],
        ["Running", "Swimming", "Cycling"],
      ),
    ).toEqual([
      { sport: "Running", sessions: 1 },
      { sport: "Cycling", sessions: 1 },
    ]);
  });

  it("puts logs under their Monday-to-Sunday week, keeping the order read", () => {
    const weeks = groupByWeek([
      log("2026-10-19", "completed"), // Monday
      log("2026-10-18", "completed"), // Sunday before
      log("2026-10-12", "completed"), // that week's Monday
      log("2026-10-11", "completed"), // the week before
    ]);
    expect(
      weeks.map((week) => [
        week.monday,
        week.entries.map((entry) => entry.actualLocalDate),
      ]),
    ).toEqual([
      ["2026-10-19", ["2026-10-19"]],
      ["2026-10-12", ["2026-10-18", "2026-10-12"]],
      ["2026-10-05", ["2026-10-11"]],
    ]);
  });

  it("says a time in hours and minutes, never a decimal", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(238)).toBe("3 h 58");
  });
});
