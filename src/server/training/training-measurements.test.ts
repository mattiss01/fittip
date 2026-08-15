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
    ["skill_repetitions", { repetitions: 20, unit: "serves" }],
    ["custom", { label: "Bouldering grade", value: "6A", unit: "Font" }],
  ])("accepts an explicit %s measurement", (mode, measurement) => {
    expect(parseTrainingMeasurement(mode, measurement)).toEqual(measurement);
  });

  it.each<[TrainingMeasurementMode, unknown]>([
    ["sets_reps_load", { sets: 4, reps: 6, load: 60 }],
    ["time_distance_pace", { distance: 5 }],
    ["duration_intensity", { duration_minutes: 45 }],
    ["skill_repetitions", { repetitions: 0, unit: "serves" }],
    ["custom", { label: "Grade", value: "6A" }],
  ])("rejects a malformed %s measurement", (mode, value) => {
    expect(() => parseTrainingMeasurement(mode, value)).toThrow(
      TrainingMeasurementValidationError,
    );
  });
});
