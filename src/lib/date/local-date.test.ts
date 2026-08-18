import { describe, expect, it } from "vitest";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";

describe("isoDateInTimezone", () => {
  it("uses the next owner-local date east of the date line", () => {
    expect(
      isoDateInTimezone(
        new Date("2026-07-28T10:30:00.000Z"),
        "Pacific/Kiritimati",
      ),
    ).toBe("2026-07-29");
  });

  it("uses the prior owner-local date west of UTC at a midnight boundary", () => {
    expect(
      isoDateInTimezone(
        new Date("2026-07-28T02:30:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe("2026-07-27");
  });
});

describe("shiftIsoDate", () => {
  it("counts calendar days across a month and a year boundary", () => {
    expect(shiftIsoDate("2026-08-30", 3)).toBe("2026-09-02");
    expect(shiftIsoDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftIsoDate("2026-08-17", 0)).toBe("2026-08-17");
  });

  it("counts a day across a daylight-saving change as one day", () => {
    // Europe/Berlin loses an hour on 2026-03-29; the calendar still advances
    // by exactly one date.
    expect(shiftIsoDate("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftIsoDate("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("refuses a value that is not a date", () => {
    expect(() => shiftIsoDate("not-a-date", 1)).toThrow();
  });
});
