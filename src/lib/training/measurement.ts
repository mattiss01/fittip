/**
 * The training-measurement shapes a Client Component may hold.
 *
 * They live here rather than in `@/server/training/training-measurements`
 * because that module imports `server-only` and sits under `@/server/**`, both
 * of which the client import boundary in
 * `src/architecture/server-boundary.test.ts` refuses — a type-only import
 * included, because that invariant reads the file rather than the compiled
 * graph. The activity editor is a Client Component, so every constant it needs
 * to build a measurement had to move somewhere it may import from.
 *
 * Nothing here validates. The server module imports these names, re-exports
 * them so its own callers are unchanged, and keeps `parseTrainingMeasurement`,
 * which is the only thing permitted to decide whether a measurement is real.
 * A value shaped like a `TrainingMeasurement` is a value that type-checks, not
 * a value the database will accept.
 */

export const TRAINING_MEASUREMENT_MODES = [
  "sets_reps_load",
  "time_distance_pace",
  "duration_intensity",
  "skill_repetitions",
  "custom",
] as const;

export type TrainingMeasurementMode =
  (typeof TRAINING_MEASUREMENT_MODES)[number];

export type TrainingMeasurement =
  | {
      sets: number;
      reps: number;
      load?: number;
      load_unit?: LoadUnit;
    }
  | {
      duration_seconds?: number;
      distance?: number;
      distance_unit?: DistanceUnit;
      pace_seconds_per_unit?: number;
      pace_unit?: PaceUnit;
    }
  | {
      duration_minutes: number;
      intensity?: Intensity;
      perceived_effort?: number;
    }
  | { repetitions: number; unit: string }
  | { label: string; value: string | number | boolean; unit: string };

export const LOAD_UNITS = ["kg", "lb"] as const;
export type LoadUnit = (typeof LOAD_UNITS)[number];

export const DISTANCE_UNITS = ["m", "km", "mi", "yd"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const PACE_UNITS = [
  "sec/km",
  "sec/mi",
  "sec/100m",
  "sec/100yd",
] as const;
export type PaceUnit = (typeof PACE_UNITS)[number];

export const INTENSITIES = ["easy", "moderate", "hard", "very_hard"] as const;
export type Intensity = (typeof INTENSITIES)[number];
