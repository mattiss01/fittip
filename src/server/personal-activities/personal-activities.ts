import "server-only";

import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
  TrainingMeasurementValidationError,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

/**
 * What one reusable activity is (A5). It carries the same fields a session's
 * activity does, so picking one is a copy of these values and nothing more.
 * The column behind `instructions` is `description` and the one behind
 * `target` is `default_measurement`; the domain uses the activity's own words
 * because those are the fields a pick fills in.
 */
export type PersonalActivityContent = {
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
};

export type PersonalActivity = PersonalActivityContent & {
  id: string;
  /**
   * The optimistic token the surface reads and sends back. The table has no
   * revision column, and an edit always moves this, so it serves as one.
   */
  updatedAt: string;
};

/**
 * There is no delete. A session, a series, a library entry and a log can each
 * point at a definition, so a row that went away would either be refused by
 * those keys or take the link with it. Archiving hides it from the library and
 * the picker for good (owner, 27 Sep 2026); to have it again, the owner saves
 * the activity from a session that holds it, which makes a new definition.
 */
export type PersonalActivityChange =
  | { operation: "create"; activity: PersonalActivityContent }
  | {
      operation: "edit";
      personalActivityId: string;
      expectedUpdatedAt: string;
      activity: PersonalActivityContent;
    }
  | {
      operation: "archive";
      personalActivityId: string;
      expectedUpdatedAt: string;
    };

export interface PersonalActivityAdapter {
  /** Active definitions only; an archived one is never read back. */
  list(): Promise<PersonalActivity[]>;
  applyChange(change: PersonalActivityChange): Promise<PersonalActivity>;
}

export class PersonalActivityValidationError extends Error {
  constructor() {
    super("The personal activity is invalid.");
    this.name = "PersonalActivityValidationError";
  }
}

/**
 * Another active definition of this owner's already has the name, compared as
 * `activityNameKey` compares it. The database refuses it; this names why.
 */
export class PersonalActivityNameTakenError extends Error {
  constructor() {
    super("An active personal activity already has this name.");
    this.name = "PersonalActivityNameTakenError";
  }
}

/** The definition changed, was archived, or never existed since it was read. */
export class PersonalActivityConflictError extends Error {
  constructor() {
    super("The personal activity changed before this write.");
    this.name = "PersonalActivityConflictError";
  }
}

export class PersonalActivityPersistenceError extends Error {
  constructor() {
    super("The personal activity operation could not be completed.");
    this.name = "PersonalActivityPersistenceError";
  }
}

/** The small external interface; persistence stays behind the adapter seam. */
export class PersonalActivityLibrary {
  constructor(private readonly adapter: PersonalActivityAdapter) {}

  async list(): Promise<PersonalActivity[]> {
    return await this.adapter.list();
  }

  async applyChange(change: unknown): Promise<PersonalActivity> {
    return await this.adapter.applyChange(parsePersonalActivityChange(change));
  }
}

export function parsePersonalActivityChange(
  value: unknown,
): PersonalActivityChange {
  const record = readRecord(value);
  switch (record.operation) {
    case "create":
      assertOnlyKeys(record, ["operation", "activity"]);
      return {
        operation: "create",
        activity: parsePersonalActivityContent(record.activity),
      };
    case "edit":
      assertOnlyKeys(record, [
        "operation",
        "personalActivityId",
        "expectedUpdatedAt",
        "activity",
      ]);
      return {
        operation: "edit",
        personalActivityId: readUuid(record.personalActivityId),
        expectedUpdatedAt: readTimestamp(record.expectedUpdatedAt),
        activity: parsePersonalActivityContent(record.activity),
      };
    case "archive":
      assertOnlyKeys(record, [
        "operation",
        "personalActivityId",
        "expectedUpdatedAt",
      ]);
      return {
        operation: "archive",
        personalActivityId: readUuid(record.personalActivityId),
        expectedUpdatedAt: readTimestamp(record.expectedUpdatedAt),
      };
    default:
      throw new PersonalActivityValidationError();
  }
}

/** The bounds are the table's own check constraints. */
export function parsePersonalActivityContent(
  value: unknown,
): PersonalActivityContent {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "name",
    "sport",
    "instructions",
    "measurementMode",
    "target",
  ]);
  const measurementMode = readChoice(
    record.measurementMode,
    TRAINING_MEASUREMENT_MODES,
  );
  let target: TrainingMeasurement | undefined;
  if (record.target !== undefined && record.target !== null) {
    try {
      target = parseTrainingMeasurement(measurementMode, record.target);
    } catch (error) {
      if (error instanceof TrainingMeasurementValidationError)
        throw new PersonalActivityValidationError();
      throw error;
    }
  }
  return {
    name: readRequiredString(record.name, 120),
    sport: readRequiredString(record.sport, 80),
    ...optionalString("instructions", record.instructions, 2000),
    measurementMode,
    ...(target === undefined ? {} : { target }),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new PersonalActivityValidationError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new PersonalActivityValidationError();
}

function readRequiredString(value: unknown, max: number) {
  if (typeof value !== "string") throw new PersonalActivityValidationError();
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max)
    throw new PersonalActivityValidationError();
  return normalized;
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
  max: number,
): Partial<Record<K, string>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "string" || value.length > max)
    throw new PersonalActivityValidationError();
  const trimmed = value.trim();
  return trimmed === "" ? {} : ({ [key]: trimmed } as Record<K, string>);
}

function readUuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new PersonalActivityValidationError();
  }
  return value.toLowerCase();
}

/**
 * Sent back exactly as it was read, because the write compares it for
 * equality. Only its shape is checked here; a well-formed value that no longer
 * matches is a conflict, which only the database can tell.
 */
function readTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new PersonalActivityValidationError();
  }
  return value;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new PersonalActivityValidationError();
  return value as T[number];
}
