import { describe, expect, it } from "vitest";

import { nextFreeTitle, savedSessionTitleKey } from "./activity-name";

describe("the title Keep both opens on", () => {
  const taken = (...titles: string[]) =>
    new Set(titles.map(savedSessionTitleKey));

  it("is the title with the first free number", () => {
    expect(nextFreeTitle("Intervals", taken("Intervals"))).toBe(
      "Intervals (2)",
    );
    expect(
      nextFreeTitle("Intervals", taken("Intervals", "intervals  (2)")),
    ).toBe("Intervals (3)");
  });

  it("counts on from a title that already carries a number", () => {
    expect(
      nextFreeTitle("Intervals (2)", taken("Intervals", "Intervals (2)")),
    ).toBe("Intervals (3)");
  });

  it("stays within a title's 120 characters", () => {
    const long = "x".repeat(120);
    const next = nextFreeTitle(long, taken(long));
    expect(next).toHaveLength(120);
    expect(next.endsWith(" (2)")).toBe(true);
  });
});
