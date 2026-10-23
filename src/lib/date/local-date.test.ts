import { describe, expect, it } from "vitest";

import {
  instantInTimezone,
  isoDateInTimezone,
  localTimeInTimezone,
  shiftIsoDate,
} from "@/lib/date/local-date";

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

describe("start times in a zone", () => {
  it("reads the instant a wall-clock time names, on either side of a clock change", () => {
    // Berlin is UTC+2 in summer time and UTC+1 after 25 Oct 2026.
    expect(
      instantInTimezone("2026-10-24", "07:30", "Europe/Berlin").toISOString(),
    ).toBe("2026-10-24T05:30:00.000Z");
    expect(
      instantInTimezone("2026-10-26", "07:30", "Europe/Berlin").toISOString(),
    ).toBe("2026-10-26T06:30:00.000Z");
    expect(
      instantInTimezone(
        "2026-10-24",
        "23:15",
        "Pacific/Auckland",
      ).toISOString(),
    ).toBe("2026-10-24T10:15:00.000Z");
  });

  it("shows an instant as the time the zone's clock read", () => {
    const instant = new Date("2026-10-26T06:30:00.000Z");
    expect(localTimeInTimezone(instant, "Europe/Berlin")).toBe("07:30");
    expect(localTimeInTimezone(instant, "UTC")).toBe("06:30");
    expect(
      localTimeInTimezone(new Date("2026-10-24T22:05:00.000Z"), "UTC"),
    ).toBe("22:05");
  });

  it("round-trips a time it wrote", () => {
    for (const time of ["00:00", "06:45", "12:00", "23:59"]) {
      expect(
        localTimeInTimezone(
          instantInTimezone("2026-03-29", time, "America/New_York"),
          "America/New_York",
        ),
      ).toBe(time);
    }
  });
});
