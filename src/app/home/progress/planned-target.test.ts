import { describe, expect, it } from "vitest";

import { describeTarget } from "./planned-target";

describe("a planned target", () => {
  it("draws nothing when the plan asked for nothing", () => {
    expect(describeTarget(null)).toBe(null);
  });

  it("describes sets, reps and load", () => {
    expect(describeTarget({ sets: 3, reps: 10 })).toBe("3 × 10");
    expect(
      describeTarget({ sets: 5, reps: 5, load: 62.5, load_unit: "kg" }),
    ).toBe("5 × 5 · 62.5 kg");
  });

  it("describes a duration and how hard it was meant to be", () => {
    expect(
      describeTarget({
        duration_minutes: 45,
        intensity: "very_hard",
        perceived_effort: 8,
      }),
    ).toBe("45 min · Very hard · Effort 8 of 10");
    expect(describeTarget({ duration_minutes: 30 })).toBe("30 min");
  });

  it("reads a time and a pace as clock readings", () => {
    expect(
      describeTarget({
        duration_seconds: 3900,
        distance: 12,
        distance_unit: "km",
        pace_seconds_per_unit: 325,
        pace_unit: "sec/km",
      }),
    ).toBe("1:05:00 · 12 km · 5:25/km");
    expect(describeTarget({ distance: 400, distance_unit: "m" })).toBe("400 m");
  });

  it("keeps a partly filled target rather than inventing the rest", () => {
    expect(describeTarget({})).toBe(null);
    // A pace with no unit is not a pace, so it is left out rather than guessed.
    expect(describeTarget({ pace_seconds_per_unit: 300 })).toBe(null);
  });

  it("describes repetitions in the owner's own unit", () => {
    expect(describeTarget({ repetitions: 20, unit: "throws" })).toBe(
      "20 throws",
    );
  });

  it("describes a custom measurement as the owner labelled it", () => {
    expect(
      describeTarget({ label: "Rowing split", value: "1:58", unit: "/500 m" }),
    ).toBe("Rowing split: 1:58 · /500 m");
    expect(
      describeTarget({
        label: "Wore a heart-rate strap",
        value: true,
        unit: "",
      }),
    ).toBe("Wore a heart-rate strap: Yes");
  });
});
