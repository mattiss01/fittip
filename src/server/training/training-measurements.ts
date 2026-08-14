import "server-only";

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
      load_unit?: "kg" | "lb";
    }
  | {
      duration_seconds?: number;
      distance?: number;
      distance_unit?: "m" | "km" | "mi" | "yd";
      pace_seconds_per_unit?: number;
      pace_unit?: "sec/km" | "sec/mi" | "sec/100m" | "sec/100yd";
    }
  | {
      duration_minutes: number;
      intensity?: "easy" | "moderate" | "hard" | "very_hard";
      perceived_effort?: number;
    }
  | { repetitions: number; unit: string }
  | { label: string; value: string | number | boolean; unit: string };

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
    case "sets_reps_load": {
      assertOnlyKeys(record, ["sets", "reps", "load", "load_unit"]);
      const load =
        record.load === undefined
          ? undefined
          : readNumber(record.load, 0, 100000);
      const loadUnit =
        record.load_unit === undefined
          ? undefined
          : readChoice(record.load_unit, ["kg", "lb"] as const);
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
          : readChoice(record.distance_unit, ["m", "km", "mi", "yd"] as const);
      const pace = optionalNumber(
        record.pace_seconds_per_unit,
        Number.MIN_VALUE,
        86400,
      );
      const paceUnit =
        record.pace_unit === undefined
          ? undefined
          : readChoice(record.pace_unit, [
              "sec/km",
              "sec/mi",
              "sec/100m",
              "sec/100yd",
            ] as const);
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
          : readChoice(record.intensity, [
              "easy",
              "moderate",
              "hard",
              "very_hard",
            ] as const);
      const effort =
        record.perceived_effort === undefined
          ? undefined
          : readInteger(record.perceived_effort, 1, 10);
      if (intensity === undefined && effort === undefined) invalid();
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
