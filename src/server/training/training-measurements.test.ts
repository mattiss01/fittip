import { describe, expect, it } from "vitest";

import {
  parseTrainingMeasurement,
  TrainingMeasurementValidationError,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

describe("preserved training measurement validation", () => {
  it.each<[TrainingMeasurementMode, unknown]>([
    ["sets_reps_load", { sets: 4, reps: 6, load: 60, load_unit: "kg" }],
    [
      "time_distance_pace",
      {
        distance: 5,
        distance_unit: "km",
        pace_seconds_per_unit: 330,
        pace_unit: "sec/km",
      },
    ],
    ["duration_intensity", { duration_minutes: 45, perceived_effort: 6 }],
    ["sets_reps_load", { groups: [{ sets: 3, seconds: 45 }] }],
    [
      "intervals",
      {
        blocks: [{ repeats: 6, distance: 400, rest_seconds: 90 }],
        distance_unit: "m",
      },
    ],
    ["intervals", { blocks: [{ repeats: 5, seconds: 180 }] }],
  ])("accepts an explicit %s measurement", (mode, measurement) => {
    expect(parseTrainingMeasurement(mode, measurement)).toEqual(measurement);
  });

  it.each<[TrainingMeasurementMode, unknown]>([
    ["sets_reps_load", { sets: 4, reps: 6, load: 60 }],
    ["time_distance_pace", { distance: 5 }],
    // `{ duration_minutes: 45 }` moved out of this list in A2c: minutes alone
    // is a prescription now, because the owner asked that intensity not be
    // mandatory. An intensity outside the four is still malformed.
    ["duration_intensity", { duration_minutes: 45, intensity: "brutal" }],
    ["sets_reps_load", { groups: [{ sets: 3, reps: 8, seconds: 30 }] }],
    ["intervals", { blocks: [{ repeats: 6, rest_seconds: 90 }] }],
    ["intervals", { blocks: [{ repeats: 6, distance: 400 }] }],
    [
      "intervals",
      { blocks: [{ repeats: 6, seconds: 60 }], distance_unit: "m" },
    ],
  ])("rejects a malformed %s measurement", (mode, value) => {
    expect(() => parseTrainingMeasurement(mode, value)).toThrow(
      TrainingMeasurementValidationError,
    );
  });
});
