import { describe, expect, it } from "vitest";

import {
  parseManualPlanInput,
  parsePersonalActivityInput,
  parseTrainingMeasurement,
  TrainingRecordValidationError,
  type TrainingMeasurementMode,
} from "@/server/training/training-records";

describe("training-record domain validation", () => {
  it.each([1, 2, 7])("accepts a %i-day horizon", (dayCount) => {
    expect(
      parseManualPlanInput({
        dayCount,
        startDate: "2026-07-28",
        timezoneName: "Europe/Berlin",
        sessions: [],
      }),
    ).toMatchObject({ dayCount });
  });

  it.each([0, 8, 1.5])("rejects an invalid %s-day horizon", (dayCount) => {
    expect(() =>
      parseManualPlanInput({
        dayCount,
        startDate: "2026-07-28",
        timezoneName: "Europe/Berlin",
        sessions: [],
      }),
    ).toThrow(TrainingRecordValidationError);
  });

  it("requires every session to stay inside the exact selected range", () => {
    expect(() =>
      parseManualPlanInput({
        dayCount: 2,
        startDate: "2026-07-28",
        timezoneName: "Europe/Berlin",
        sessions: [session({ localDate: "2026-07-30" })],
      }),
    ).toThrow(TrainingRecordValidationError);
  });

  it("handles leap dates and rejects impossible owner-local dates", () => {
    expect(
      parseManualPlanInput({
        dayCount: 2,
        startDate: "2028-02-29",
        timezoneName: "UTC",
        sessions: [session({ localDate: "2028-03-01" })],
      }),
    ).toMatchObject({ startDate: "2028-02-29" });

    expect(() =>
      parseManualPlanInput({
        dayCount: 1,
        startDate: "2026-02-29",
        timezoneName: "UTC",
        sessions: [],
      }),
    ).toThrow(TrainingRecordValidationError);
  });

  it("rejects invalid timezones, duplicate session slots, and duplicate activity positions", () => {
    expect(() =>
      parseManualPlanInput({
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "Not/A_Timezone",
        sessions: [],
      }),
    ).toThrow(TrainingRecordValidationError);

    expect(() =>
      parseManualPlanInput({
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "UTC",
        sessions: [session(), session()],
      }),
    ).toThrow(TrainingRecordValidationError);

    expect(() =>
      parseManualPlanInput({
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "UTC",
        sessions: [
          session({
            activities: [activity(), activity()],
          }),
        ],
      }),
    ).toThrow(TrainingRecordValidationError);
  });

  it("normalizes personal activity text without adding a global catalog", () => {
    expect(
      parsePersonalActivityInput({
        name: "  Easy spin  ",
        sport: " Cycling ",
        measurementMode: "duration_intensity",
        defaultMeasurement: {
          duration_minutes: 30,
          intensity: "easy",
        },
      }),
    ).toEqual({
      name: "Easy spin",
      sport: "Cycling",
      measurementMode: "duration_intensity",
      defaultMeasurement: {
        duration_minutes: 30,
        intensity: "easy",
      },
    });
  });

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
  ])("rejects a unit-ambiguous or malformed %s measurement", (mode, value) => {
    expect(() => parseTrainingMeasurement(mode, value)).toThrow(
      TrainingRecordValidationError,
    );
  });

  it("rejects unknown database-boundary fields", () => {
    expect(() =>
      parseManualPlanInput({
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "UTC",
        sessions: [],
        userId: "caller-controlled",
      }),
    ).toThrow(TrainingRecordValidationError);
  });
});

function session(overrides: Record<string, unknown> = {}) {
  return {
    localDate: "2026-07-28",
    position: 0,
    title: "Morning session",
    sport: "Running",
    activities: [],
    ...overrides,
  };
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    position: 0,
    name: "Easy run",
    sport: "Running",
    measurementMode: "time_distance_pace",
    target: { duration_seconds: 1800 },
    ...overrides,
  };
}
