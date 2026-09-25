import "server-only";

import {
  DISTANCE_UNITS,
  INTENSITIES,
  LOAD_UNITS,
  PACE_UNITS,
  TRAINING_MEASUREMENT_MODES,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";

/**
 * The shapes and the choice lists moved to `@/lib/training/measurement` so the
 * activity editor, which is a Client Component, could import them: the client
 * boundary refuses `@/server/**` even for a type-only import. They are
 * re-exported here so every existing caller of this module is unchanged, and
 * so that the validator below and the editor cannot drift onto two different
 * lists of units.
 */
export {
  TRAINING_MEASUREMENT_MODES,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
};

export class TrainingMeasurementValidationError extends Error {
  constructor() {
    super("The training measurement is invalid.");
    this.name = "TrainingMeasurementValidationError";
  }
}

export function parseTrainingMeasurement(
  mode: TrainingMeasurementMode,
  value: unknown,
): TrainingMeasurement {
  const record = readRecord(value);
  if (JSON.stringify(record).length > 4096) invalid();

  switch (mode) {
    // An unmeasured activity carries nothing. The caller reaches this only
    // with a non-null value, since a null target never gets here, so any
    // object at all is a contradiction — the same answer the SQL gives.
    case "unmeasured":
      invalid();
    case "sets_reps_load": {
      if ("groups" in record) return parseSetGroups(record);
      assertOnlyKeys(record, ["sets", "reps", "load", "load_unit"]);
      const load =
        record.load === undefined
          ? undefined
          : readNumber(record.load, 0, 100000);
      const loadUnit =
        record.load_unit === undefined
          ? undefined
          : readChoice(record.load_unit, LOAD_UNITS);
      if ((load === undefined) !== (loadUnit === undefined)) invalid();
      return {
        sets: readInteger(record.sets, 1, 100),
        reps: readInteger(record.reps, 1, 10000),
        ...(load === undefined ? {} : { load, load_unit: loadUnit }),
      };
    }
    case "time_distance_pace": {
      assertOnlyKeys(record, [
        "duration_seconds",
        "distance",
        "distance_unit",
        "pace_seconds_per_unit",
        "pace_unit",
      ]);
      const durationSeconds = optionalNumber(
        record.duration_seconds,
        Number.MIN_VALUE,
        604800,
      );
      const distance = optionalNumber(
        record.distance,
        Number.MIN_VALUE,
        1000000,
      );
      const distanceUnit =
        record.distance_unit === undefined
          ? undefined
          : readChoice(record.distance_unit, DISTANCE_UNITS);
      const pace = optionalNumber(
        record.pace_seconds_per_unit,
        Number.MIN_VALUE,
        86400,
      );
      const paceUnit =
        record.pace_unit === undefined
          ? undefined
          : readChoice(record.pace_unit, PACE_UNITS);
      if (
        (durationSeconds === undefined &&
          distance === undefined &&
          pace === undefined) ||
        (distance === undefined) !== (distanceUnit === undefined) ||
        (pace === undefined) !== (paceUnit === undefined)
      )
        invalid();
      return {
        ...(durationSeconds === undefined
          ? {}
          : { duration_seconds: durationSeconds }),
        ...(distance === undefined
          ? {}
          : { distance, distance_unit: distanceUnit }),
        ...(pace === undefined
          ? {}
          : { pace_seconds_per_unit: pace, pace_unit: paceUnit }),
      };
    }
    case "duration_intensity": {
      assertOnlyKeys(record, [
        "duration_minutes",
        "intensity",
        "perceived_effort",
      ]);
      const intensity =
        record.intensity === undefined
          ? undefined
          : readChoice(record.intensity, INTENSITIES);
      const effort =
        record.perceived_effort === undefined
          ? undefined
          : readInteger(record.perceived_effort, 1, 10);
      // Minutes alone is a prescription since A2c. `is_valid_training_measurement`
      // dropped the same requirement in the same migration; this mirrors it,
      // and the agreement test in `measurement-draft.test.ts` is what holds
      // the two together.
      return {
        duration_minutes: readNumber(
          record.duration_minutes,
          Number.MIN_VALUE,
          10080,
        ),
        ...(intensity === undefined ? {} : { intensity }),
        ...(effort === undefined ? {} : { perceived_effort: effort }),
      };
    }
    case "skill_repetitions":
      assertOnlyKeys(record, ["repetitions", "unit"]);
      return {
        repetitions: readInteger(record.repetitions, 1, 1000000),
        unit: readString(record.unit, 32),
      };
    case "custom": {
      assertOnlyKeys(record, ["label", "value", "unit"]);
      const customValue = record.value;
      if (
        !["string", "number", "boolean"].includes(typeof customValue) ||
        (typeof customValue === "number" && !Number.isFinite(customValue)) ||
        String(customValue).length > 500
      )
        invalid();
      return {
        label: readString(record.label, 80),
        value: customValue as string | number | boolean,
        unit: readString(record.unit, 32),
      };
    }
  }
}

/**
 * The grouped `sets_reps_load` form. Mirrors the grouped branch of
 * `is_valid_training_measurement`, which is the authority — a value this
 * accepts and the database refuses is a bug here, and the pgTAP suite beside
 * that function is where the two are held together.
 *
 * Recognised by the key rather than by trying the flat form and falling
 * through, so a value carrying both shapes is refused instead of being read as
 * whichever branch happens to come first.
 */
function parseSetGroups(record: Record<string, unknown>): TrainingMeasurement {
  assertOnlyKeys(record, ["groups", "load_unit"]);
  const raw = record.groups;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) invalid();

  let loaded = false;
  const groups = raw.map((entry) => {
    const group = readRecord(entry);
    assertOnlyKeys(group, ["sets", "reps", "load"]);
    const sets =
      group.sets === undefined ? undefined : readInteger(group.sets, 1, 100);
    const reps =
      group.reps === undefined ? undefined : readInteger(group.reps, 1, 10000);
    const load =
      group.load === undefined ? undefined : readNumber(group.load, 0, 100000);
    // At least one of the three, the rule `time_distance_pace` already
    // follows. A group carrying no numbers says nothing.
    if (sets === undefined && reps === undefined && load === undefined) {
      invalid();
    }
    if (load !== undefined) loaded = true;
    return {
      ...(sets === undefined ? {} : { sets }),
      ...(reps === undefined ? {} : { reps }),
      ...(load === undefined ? {} : { load }),
    };
  });

  // The unit is required exactly when some group carries a load, which is the
  // same paired rule the flat form applies to `load`/`load_unit`.
  if (loaded) {
    return { groups, load_unit: readChoice(record.load_unit, LOAD_UNITS) };
  }
  if (record.load_unit !== undefined) invalid();
  return { groups };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid();
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) invalid();
}

function optionalNumber(value: unknown, min: number, max: number) {
  return value === undefined ? undefined : readNumber(value, min, max);
}

function readNumber(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    invalid();
  return value;
}

function readInteger(value: unknown, min: number, max: number) {
  const result = readNumber(value, min, max);
  if (!Number.isInteger(result)) invalid();
  return result;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) invalid();
  return value as T[number];
}

function readString(value: unknown, max: number) {
  if (typeof value !== "string") invalid();
  const result = value.trim();
  if (result.length < 1 || result.length > max) invalid();
  return result;
}

function invalid(): never {
  throw new TrainingMeasurementValidationError();
}
