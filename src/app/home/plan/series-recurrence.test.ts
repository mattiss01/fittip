import { describe, expect, it } from "vitest";

import {
  findUncoveredSeriesDates,
  seriesOccurrenceDates,
} from "./series-recurrence";

describe("recurring-session dates", () => {
  it("expands bounded daily and anchored weekly rules without instants", () => {
    expect(
      seriesOccurrenceDates(
        {
          frequency: "daily",
          intervalCount: 2,
          startDate: "2026-08-20",
          endDate: "2026-08-25",
        },
        "2026-08-20",
        "2026-09-01",
      ),
    ).toEqual(["2026-08-20", "2026-08-22", "2026-08-24"]);

    expect(
      seriesOccurrenceDates(
        {
          frequency: "weekly",
          intervalCount: 2,
          weekdays: [1, 4],
          startDate: "2026-08-20",
        },
        "2026-08-20",
        "2026-09-10",
      ),
    ).toEqual(["2026-08-20", "2026-08-31", "2026-09-03"]);
  });

  it("finds only materializable gaps and treats cancelled occurrences as covered", () => {
    const series = [
      {
        id: "series-a",
        frequency: "daily" as const,
        intervalCount: 1,
        startDate: "2026-08-20",
        endDate: "2026-08-22",
      },
    ];
    const sessions = [
      {
        localDate: "2026-08-20",
        status: "cancelled" as const,
        seriesId: "series-a",
        occurrenceDate: "2026-08-20",
      },
      ...Array.from({ length: 10 }, () => ({
        localDate: "2026-08-21",
        status: "active" as const,
        seriesId: null,
        occurrenceDate: null,
      })),
    ];

    expect(
      findUncoveredSeriesDates(series, sessions, "2026-08-20", "2026-08-22"),
    ).toEqual(["2026-08-22"]);
  });
});
