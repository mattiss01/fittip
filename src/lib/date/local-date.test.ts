import { describe, expect, it } from "vitest";

import { isoDateInTimezone } from "@/lib/date/local-date";

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
