import { describe, expect, it } from "vitest";

import {
  colourOf,
  readRequestedSport,
  SPORT_BEYOND_PALETTE,
  SPORT_PALETTE,
  sportColours,
} from "./sport-colours";

describe("sport colours", () => {
  it("gives the palette out most-logged first", () => {
    const colours = sportColours(["Running", "Strength", "Climbing"]);
    expect(colours.map(({ colour }) => colour)).toEqual(
      SPORT_PALETTE.slice(0, 3),
    );
    expect(colourOf(colours, "Strength")).toBe(SPORT_PALETTE[1]);
  });

  it("never repeats a colour: past the palette a sport is drawn muted", () => {
    const sports = Array.from(
      { length: SPORT_PALETTE.length + 2 },
      (_, index) => `Sport ${index}`,
    );
    const colours = sportColours(sports).map(({ colour }) => colour);
    expect(colours.slice(-2)).toEqual([
      SPORT_BEYOND_PALETTE,
      SPORT_BEYOND_PALETTE,
    ]);
    expect(new Set(colours.slice(0, SPORT_PALETTE.length)).size).toBe(
      SPORT_PALETTE.length,
    );
  });

  it("draws a log without a known sport muted", () => {
    expect(colourOf(sportColours(["Running"]), null)).toBe(
      SPORT_BEYOND_PALETTE,
    );
  });
});

describe("the sport asked for", () => {
  it("is a sport the owner has logged, or none", () => {
    expect(readRequestedSport("Running", ["Running"])).toBe("Running");
    expect(readRequestedSport("Curling", ["Running"])).toBeNull();
    expect(readRequestedSport(["Running"], ["Running"])).toBeNull();
    expect(readRequestedSport(undefined, ["Running"])).toBeNull();
  });
});
