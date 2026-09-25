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
  /**
   * An activity with nothing to count — a tennis drill listed by name and no
   * more. It exists so such a row stops claiming a mode nobody chose: before
   * it, the only way to record one was to say it was measured in sets and reps
   * while measuring nothing, which a later Progress surface would read as
   * chartable. A value in this mode has no target at all.
   */
  "unmeasured",
  "sets_reps_load",
  "time_distance_pace",
  "duration_intensity",
  "skill_repetitions",
  "custom",
] as const;

export type TrainingMeasurementMode =
  (typeof TRAINING_MEASUREMENT_MODES)[number];

/**
 * One block of a `sets_reps_load` prescription: some number of sets of the
 * same thing. Every field is optional with at least one present, which is the
 * rule `time_distance_pace` has followed since M1-01, and is what makes
 * "3 sets" with no reps sayable.
 */
export type SetGroup = {
  sets?: number;
  reps?: number;
  load?: number;
};

export type TrainingMeasurement =
  /**
   * The grouped `sets_reps_load` form: a squat that ramps is 3×5 at 60 kg then
   * 1×3 at 100 kg, one activity rather than three rows repeating a name. The
   * uniform case is simply the one-group case, so no toggle distinguishes
   * them. The unit sits once at the top because a prescription does not switch
   * between kilograms and pounds partway down.
   */
  | {
      groups: SetGroup[];
      load_unit?: LoadUnit;
    }
  /**
   * The flat `sets_reps_load` form, which nothing writes any more and
   * everything must still read. It is not kept out of politeness towards old
   * rows: measurements sealed into `completions.planned_snapshot` and
   * `rolling_plan_change_entries.before_state` are permanent history that is
   * never rewritten, so this shape has to stay readable for good.
   */
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
