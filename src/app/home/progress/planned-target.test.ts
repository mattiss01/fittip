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

  it("describes sets held for a time, with a weight or without", () => {
    expect(describeTarget({ groups: [{ sets: 3, seconds: 45 }] })).toBe(
      "3 × 45 s",
    );
    expect(
      describeTarget({
        groups: [{ sets: 2, seconds: 90, load: 10 }],
        load_unit: "kg",
      }),
    ).toBe("2 × 1:30 · 10 kg");
  });

  it("describes interval blocks, a distance in a time, and rest", () => {
    expect(
      describeTarget({
        blocks: [
          { repeats: 6, distance: 400, rest_seconds: 90 },
          { repeats: 4, distance: 200, seconds: 40 },
        ],
        distance_unit: "m",
      }),
    ).toBe("6 × 400 m · 1:30 rest + 4 × 200 m in 40 s");
    expect(
      describeTarget({
        blocks: [{ repeats: 5, seconds: 180, rest_seconds: 0 }],
      }),
    ).toBe("5 × 3:00 · 0:00 rest");
  });
});
