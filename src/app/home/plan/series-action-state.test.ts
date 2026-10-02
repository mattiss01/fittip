import { describe, expect, it } from "vitest";

import { summarizeSkippedDates } from "./series-action-state";

describe("summarizeSkippedDates", () => {
  it("names a full date once, however many series it turned away", () => {
    expect(
      summarizeSkippedDates([
        { occurrenceDate: "2026-10-09", reason: "daily-session-limit" },
        { occurrenceDate: "2026-10-05", reason: "daily-session-limit" },
        { occurrenceDate: "2026-10-09", reason: "daily-session-limit" },
      ]),
    ).toEqual({ fullDates: ["2026-10-05", "2026-10-09"], waiting: 0 });
  });

  it("counts what a fill left for the next pass instead of listing it", () => {
    const waiting = Array.from({ length: 82 }, (_, index) => ({
      occurrenceDate: `2026-11-${String((index % 28) + 1).padStart(2, "0")}`,
      reason: "change-set-limit" as const,
    }));

    expect(
      summarizeSkippedDates([
        { occurrenceDate: "2026-10-05", reason: "daily-session-limit" },
        ...waiting,
      ]),
    ).toEqual({ fullDates: ["2026-10-05"], waiting: 82 });
  });

  it("is empty for nothing skipped", () => {
    expect(summarizeSkippedDates([])).toEqual({ fullDates: [], waiting: 0 });
  });
});
