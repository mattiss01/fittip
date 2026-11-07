import { describe, expect, it } from "vitest";

import { colourOf, readRequestedSports, sportColours } from "./sport-colours";
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

describe("the sports asked for", () => {
  it("are sports the owner has logged, in the chips' order, or none", () => {
    const logged = ["Running", "Cycling", "Swimming"];
    expect(readRequestedSports("Running", logged)).toEqual(["Running"]);
    expect(readRequestedSports(["Swimming", "Running"], logged)).toEqual([
      "Running",
      "Swimming",
    ]);
    expect(readRequestedSports(["Curling", "Cycling"], logged)).toEqual([
      "Cycling",
    ]);
    expect(readRequestedSports("Curling", logged)).toEqual([]);
    expect(readRequestedSports(undefined, logged)).toEqual([]);
  });
});
