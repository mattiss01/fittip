import { describe, expect, it } from "vitest";

import { colourOf, readRequestedSport, sportColours } from "./sport-colours";
import { UNLISTED_SPORT_COLOUR } from "@/lib/sports/sport-colours";

const OWNED = [
  { id: "a", name: "Running", colour: "sport-4" as const },
  { id: "b", name: "Strength", colour: "sport-1" as const },
];

describe("sport colours", () => {
  it("draws each logged sport in the colour the owner gave it", () => {
    const colours = sportColours(["Strength", "running "], OWNED);
    expect(colours.map(({ colour }) => colour)).toEqual([
      "var(--sport-1)",
      "var(--sport-4)",
    ]);
    expect(colourOf(colours, "running ")).toBe("var(--sport-4)");
  });

  it("draws a sport that is not on the owner's list muted", () => {
    expect(sportColours(["Climbing"], OWNED)[0].colour).toBe(
      UNLISTED_SPORT_COLOUR,
    );
  });

  it("draws a log without a known sport muted", () => {
    expect(colourOf(sportColours(["Running"], OWNED), null)).toBe(
      UNLISTED_SPORT_COLOUR,
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
