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
  | {
      repetitions: number;
      unit: string;
    }
  | {
      label: string;
      value: string | number | boolean;
      unit: string;
    };

export type PersonalActivityInput = {
  name: string;
  sport: string;
  description?: string;
  measurementMode: TrainingMeasurementMode;
  defaultMeasurement?: TrainingMeasurement;
};

export type PlannedActivityInput = {
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
  isLocked: boolean;
};

export type PlannedSessionInput = {
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent?: string;
  expectedDurationMinutes?: number;
  note?: string;
  isLocked: boolean;
  activities: PlannedActivityInput[];
};

export type ManualPlanInput = {
  dayCount: number;
  startDate: string;
  timezoneName: string;
  sessions: PlannedSessionInput[];
};

export class TrainingRecordValidationError extends Error {
  constructor() {
    super("The training record is invalid.");
    this.name = "TrainingRecordValidationError";
  }
}

export function parsePersonalActivityInput(
  value: unknown,
): PersonalActivityInput {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "name",
    "sport",
    "description",
    "measurementMode",
    "defaultMeasurement",
  ]);

  const measurementMode = readMeasurementMode(record.measurementMode);
  const defaultMeasurement =
    record.defaultMeasurement === undefined ||
    record.defaultMeasurement === null
      ? undefined
      : parseTrainingMeasurement(measurementMode, record.defaultMeasurement);

  return {
    name: readRequiredString(record.name, 120),
    sport: readRequiredString(record.sport, 80),
    description: readOptionalString(record.description, 2000),
    measurementMode,
    defaultMeasurement,
  };
}

export function parseManualPlanInput(value: unknown): ManualPlanInput {
  const record = readRecord(value);
  assertOnlyKeys(record, ["dayCount", "startDate", "timezoneName", "sessions"]);

  const dayCount = readInteger(record.dayCount, 1, 7);
  const startDate = readIsoDate(record.startDate);
  const timezoneName = readTimezone(record.timezoneName);
  const sessionsValue = record.sessions;

  if (!Array.isArray(sessionsValue) || sessionsValue.length > 70) {
    throw new TrainingRecordValidationError();
  }

  const lastDate = addIsoDays(startDate, dayCount - 1);
  const sessionKeys = new Set<string>();
  const sessions = sessionsValue.map((session) => {
    const parsed = parsePlannedSession(session);
    if (parsed.localDate < startDate || parsed.localDate > lastDate) {
      throw new TrainingRecordValidationError();
    }

    const key = `${parsed.localDate}:${parsed.position}`;
    if (sessionKeys.has(key)) {
      throw new TrainingRecordValidationError();
    }
    sessionKeys.add(key);
    return parsed;
  });

  return {
    dayCount,
    startDate,
    timezoneName,
    sessions,
  };
}

export function parseTrainingMeasurement(
  mode: TrainingMeasurementMode,
  value: unknown,
): TrainingMeasurement {
  const record = readRecord(value);

  if (JSON.stringify(record).length > 4096) {
    throw new TrainingRecordValidationError();
  }

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

      if ((load === undefined) !== (loadUnit === undefined)) {
        throw new TrainingRecordValidationError();
      }

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
      const durationSeconds =
        record.duration_seconds === undefined
          ? undefined
          : readNumber(record.duration_seconds, Number.MIN_VALUE, 604800);
      const distance =
        record.distance === undefined
          ? undefined
          : readNumber(record.distance, Number.MIN_VALUE, 1000000);
      const distanceUnit =
        record.distance_unit === undefined
          ? undefined
          : readChoice(record.distance_unit, ["m", "km", "mi", "yd"] as const);
      const pace =
        record.pace_seconds_per_unit === undefined
          ? undefined
          : readNumber(record.pace_seconds_per_unit, Number.MIN_VALUE, 86400);
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
        durationSeconds === undefined &&
        distance === undefined &&
        pace === undefined
      ) {
        throw new TrainingRecordValidationError();
      }
      if ((distance === undefined) !== (distanceUnit === undefined)) {
        throw new TrainingRecordValidationError();
      }
      if ((pace === undefined) !== (paceUnit === undefined)) {
        throw new TrainingRecordValidationError();
      }

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

      if (intensity === undefined && effort === undefined) {
        throw new TrainingRecordValidationError();
      }

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
        unit: readRequiredString(record.unit, 32),
      };

    case "custom": {
      assertOnlyKeys(record, ["label", "value", "unit"]);
      const customValue = record.value;
      if (
        !["string", "number", "boolean"].includes(typeof customValue) ||
        (typeof customValue === "number" && !Number.isFinite(customValue)) ||
        String(customValue).length > 500
      ) {
        throw new TrainingRecordValidationError();
      }

      return {
        label: readRequiredString(record.label, 80),
        value: customValue as string | number | boolean,
        unit: readRequiredString(record.unit, 32),
      };
    }
  }
}

function parsePlannedSession(value: unknown): PlannedSessionInput {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "localDate",
    "position",
    "title",
    "sport",
    "intent",
    "expectedDurationMinutes",
    "note",
    "isLocked",
    "activities",
  ]);

  if (!Array.isArray(record.activities) || record.activities.length > 50) {
    throw new TrainingRecordValidationError();
  }

  const activityPositions = new Set<number>();
  const activities = record.activities.map((activity) => {
    const parsed = parsePlannedActivity(activity);
    if (activityPositions.has(parsed.position)) {
      throw new TrainingRecordValidationError();
    }
    activityPositions.add(parsed.position);
    return parsed;
  });

  return {
    localDate: readIsoDate(record.localDate),
    position: readInteger(record.position, 0, 99),
    title: readRequiredString(record.title, 120),
    sport: readRequiredString(record.sport, 80),
    intent: readOptionalString(record.intent, 500),
    expectedDurationMinutes:
      record.expectedDurationMinutes === undefined ||
      record.expectedDurationMinutes === null
        ? undefined
        : readInteger(record.expectedDurationMinutes, 1, 10080),
    note: readOptionalString(record.note, 2000),
    isLocked: readOptionalBoolean(record.isLocked),
    activities,
  };
}

function parsePlannedActivity(value: unknown): PlannedActivityInput {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "personalActivityId",
    "position",
    "name",
    "sport",
    "instructions",
    "measurementMode",
    "target",
    "isLocked",
  ]);

  const measurementMode = readMeasurementMode(record.measurementMode);
  return {
    personalActivityId:
      record.personalActivityId === undefined ||
      record.personalActivityId === null
        ? undefined
        : readUuid(record.personalActivityId),
    position: readInteger(record.position, 0, 99),
    name: readRequiredString(record.name, 120),
    sport: readRequiredString(record.sport, 80),
    instructions: readOptionalString(record.instructions, 2000),
    measurementMode,
    target:
      record.target === undefined || record.target === null
        ? undefined
        : parseTrainingMeasurement(measurementMode, record.target),
    isLocked: readOptionalBoolean(record.isLocked),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TrainingRecordValidationError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new TrainingRecordValidationError();
  }
}

function readRequiredString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new TrainingRecordValidationError();
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TrainingRecordValidationError();
  }
  return normalized;
}

function readOptionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new TrainingRecordValidationError();
  }
  return value;
}

function readNumber(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new TrainingRecordValidationError();
  }
  return value;
}

function readInteger(value: unknown, min: number, max: number): number {
  const number = readNumber(value, min, max);
  if (!Number.isInteger(number)) {
    throw new TrainingRecordValidationError();
  }
  return number;
}

function readOptionalBoolean(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new TrainingRecordValidationError();
  }
  return value;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new TrainingRecordValidationError();
  }
  return value as T[number];
}

function readMeasurementMode(value: unknown): TrainingMeasurementMode {
  return readChoice(value, TRAINING_MEASUREMENT_MODES);
}

function readUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new TrainingRecordValidationError();
  }
  return value.toLowerCase();
}

function readIsoDate(value: unknown): string {
  if (typeof value !== "string") {
    throw new TrainingRecordValidationError();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TrainingRecordValidationError();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TrainingRecordValidationError();
  }

  return value;
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readTimezone(value: unknown): string {
  const timezone = readRequiredString(value, 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new TrainingRecordValidationError();
  }
  return timezone;
}
