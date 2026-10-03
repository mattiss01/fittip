import { describe, expect, it } from "vitest";

import { formatRoadmapDate, formatRoadmapRange } from "./roadmap-dates";

describe("roadmap dates", () => {
  it("writes a day with its year", () => {
    expect(formatRoadmapDate("2026-10-03")).toBe("3 Oct 2026");
  });

  it("names a shared year once in a range", () => {
    expect(formatRoadmapRange("2026-10-03", "2026-12-26")).toBe(
      "3 Oct → 26 Dec 2026",
    );
  });

  it("names both years when a range crosses one", () => {
    expect(formatRoadmapRange("2026-11-14", "2027-02-01")).toBe(
      "14 Nov 2026 → 1 Feb 2027",
    );
  });

  it("shows a value it cannot read as stored", () => {
    expect(formatRoadmapDate("")).toBe("");
    expect(formatRoadmapRange("", "2026-12-26")).toBe(" → 2026-12-26");
  });
});
