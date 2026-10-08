import { describe, expect, it } from "vitest";

import { SPORT_SUGGESTIONS_MAX, suggestSports } from "./sport-suggestions";

const SPORTS = ["Running", "Trail running", "Cycling", "Strength training"];

describe("suggestSports", () => {
  it("offers nothing until a letter is typed", () => {
    expect(suggestSports(SPORTS, "")).toEqual([]);
    expect(suggestSports(SPORTS, "   ")).toEqual([]);
  });

  it("finds the sports with a word that begins as typed", () => {
    expect(suggestSports(SPORTS, "run")).toEqual(["Running", "Trail running"]);
    expect(suggestSports(SPORTS, " TR")).toEqual([
      "Trail running",
      "Strength training",
    ]);
  });

  it("does not match the middle of a word", () => {
    expect(suggestSports(SPORTS, "ing")).toEqual([]);
  });

  it("does not offer back a sport typed out in full", () => {
    expect(suggestSports(SPORTS, "cycling")).toEqual([]);
    expect(suggestSports(SPORTS, "trail running")).toEqual([]);
    // Another that begins the same way still is.
    expect(suggestSports(SPORTS, "running")).toEqual(["Trail running"]);
  });

  it("leaves out the sports already chosen", () => {
    expect(suggestSports(SPORTS, "run", ["running"])).toEqual([
      "Trail running",
    ]);
  });

  it("stops at what fits under a field", () => {
    const many = Array.from({ length: 20 }, (_, index) => `Sport ${index}`);
    expect(suggestSports(many, "s")).toHaveLength(SPORT_SUGGESTIONS_MAX);
  });
});
