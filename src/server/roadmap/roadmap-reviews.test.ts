import { describe, expect, it } from "vitest";

import { roadmapReviewDue } from "./roadmap-reviews";

const PHASES = [
  { endDate: "2026-10-31" },
  { endDate: "2026-11-30" },
  { endDate: "2026-12-31" },
];

/**
 * ADR-027. One review as each phase ends; due from the phase's last day; only
 * the latest ended phase asks; the last phase is the end of the roadmap.
 */
describe("roadmapReviewDue", () => {
  it("asks for nothing before the first phase has ended", () => {
    expect(roadmapReviewDue(PHASES, "2026-10-30", null)).toBeNull();
  });

  it("is due on a phase's last day itself", () => {
    expect(roadmapReviewDue(PHASES, "2026-10-31", null)).toEqual({
      phaseIndex: 0,
      endedOn: "2026-10-31",
      roadmapEnded: false,
    });
  });

  it("asks only for the latest phase that ended", () => {
    expect(roadmapReviewDue(PHASES, "2026-12-01", null)).toEqual({
      phaseIndex: 1,
      endedOn: "2026-11-30",
      roadmapEnded: false,
    });
  });

  it("is cleared by a mark on that phase or a later one, and by nothing earlier", () => {
    expect(roadmapReviewDue(PHASES, "2026-12-01", 1)).toBeNull();
    expect(roadmapReviewDue(PHASES, "2026-12-01", 2)).toBeNull();
    expect(roadmapReviewDue(PHASES, "2026-12-01", 0)?.phaseIndex).toBe(1);
  });

  it("says the roadmap has ended when its last phase has", () => {
    expect(roadmapReviewDue(PHASES, "2027-03-01", 1)).toEqual({
      phaseIndex: 2,
      endedOn: "2026-12-31",
      roadmapEnded: true,
    });
    expect(roadmapReviewDue(PHASES, "2027-03-01", 2)).toBeNull();
  });

  it("asks for nothing of a roadmap with no phases", () => {
    expect(roadmapReviewDue([], "2027-03-01", null)).toBeNull();
  });
});
