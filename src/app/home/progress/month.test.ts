import { describe, expect, it } from "vitest";

import {
  formatMonth,
  monthOf,
  monthWindow,
  readRequestedMonth,
  shiftMonth,
} from "./month";

describe("the Progress month", () => {
  it("reads a month the owner asked for", () => {
    expect(readRequestedMonth("2026-08")).toBe("2026-08");
  });

  it("refuses anything that is not one calendar month", () => {
    for (const value of [
      undefined,
      ["2026-08"],
      "2026-8",
      "2026-13",
      "2026-00",
      "2026-08-01",
      "not-a-month",
      // Outside the range a training record can plausibly cover, where the
      // year arithmetic also stops round-tripping through `toISOString`.
      "0000-01",
      "3000-01",
    ]) {
      expect(readRequestedMonth(value as string | string[] | undefined)).toBe(
        null,
      );
    }
  });

  it("bounds a month at both ends, including a leap February", () => {
    expect(monthWindow("2026-08")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(monthWindow("2026-02")).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
    expect(monthWindow("2024-02")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
  });

  it("steps across a year boundary in both directions", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-08", 0)).toBe("2026-08");
  });

  it("never overflows a short month when it steps", () => {
    // A 31st that stepped by day rather than by month would land in March.
    expect(shiftMonth("2026-01", 1)).toBe("2026-02");
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("takes the month of an owner-local date", () => {
    expect(monthOf("2026-08-31")).toBe("2026-08");
  });

  it("names a month the way the owner would say it", () => {
    expect(formatMonth("2026-08")).toBe("August 2026");
  });
});
