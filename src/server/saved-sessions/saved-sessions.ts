import "server-only";

import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
  TrainingMeasurementValidationError,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

/**
 * The reusable half of a planned activity. A Plan lock belongs to a date, not
 * to reusable content, so it is absent here.
 */
export type SavedSessionActivity = {
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
};

/**
 * Everything a saved session is, minus its identity and its activities: the
 * reusable fields of a planned session plus the owner's own name for it.
 */
export type SavedSessionContent = {
  name: string;
  title: string;
  sport: string;
  intent?: string;
  expectedDurationMinutes?: number;
  note?: string;
};

export type SavedSessionDraft = SavedSessionContent & {
  activities: SavedSessionActivity[];
};

export type SavedSession = SavedSessionContent & {
  id: string;
  /**
   * The optimistic token the surface reads and sends back. It is not a
   * revision chain: no prior version is retained and none can be browsed.
   */
  revision: number;
  activities: SavedSessionActivity[];
  updatedAt: string;
};

export type SavedSessionChange =
  | { operation: "create"; session: SavedSessionDraft }
  | {
      operation: "edit";
      savedSessionId: string;
      expectedRevision: number;
      session: SavedSessionContent;
    }
  | {
      operation: "delete";
      savedSessionId: string;
      expectedRevision: number;
    };

export type SavedSessionReceipt = {
  savedSessionId: string;
  revision: number;
  result: "created" | "updated" | "deleted";
};

export interface SavedSessionAdapter {
  list(): Promise<SavedSession[]>;
  get(savedSessionId: string): Promise<SavedSession | null>;
  applyChange(change: SavedSessionChange): Promise<SavedSessionReceipt>;
}

export class SavedSessionValidationError extends Error {
  constructor() {
    super("The saved session is invalid.");
    this.name = "SavedSessionValidationError";
  }
}

/** The record changed, or no longer exists, since the owner read it. */
export class SavedSessionConflictError extends Error {
  constructor() {
    super("The saved session changed before this write.");
    this.name = "SavedSessionConflictError";
  }
}

export class SavedSessionPersistenceError extends Error {
  constructor() {
    super("The saved session operation could not be completed.");
    this.name = "SavedSessionPersistenceError";
  }
}

/** The most activities one saved session may carry, as for a planned session. */
export const SAVED_SESSION_ACTIVITY_LIMIT = 50;

/** The small external interface; persistence stays behind the adapter seam. */
export class SavedSessionLibrary {
  constructor(private readonly adapter: SavedSessionAdapter) {}

  async list(): Promise<SavedSession[]> {
    return await this.adapter.list();
  }

  async get(savedSessionId: unknown): Promise<SavedSession | null> {
    return await this.adapter.get(readUuid(savedSessionId));
  }

  async applyChange(change: unknown): Promise<SavedSessionReceipt> {
    return await this.adapter.applyChange(parseSavedSessionChange(change));
  }
}

export function parseSavedSessionChange(value: unknown): SavedSessionChange {
  const record = readRecord(value);
  switch (record.operation) {
    case "create":
      assertOnlyKeys(record, ["operation", "session"]);
      return { operation: "create", session: parseDraft(record.session) };
    case "edit":
      assertOnlyKeys(record, [
        "operation",
        "savedSessionId",
        "expectedRevision",
        "session",
      ]);
      return {
        operation: "edit",
        savedSessionId: readUuid(record.savedSessionId),
        expectedRevision: readInteger(
          record.expectedRevision,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        session: parseContent(record.session),
      };
    case "delete":
      assertOnlyKeys(record, [
        "operation",
        "savedSessionId",
        "expectedRevision",
      ]);
      return {
        operation: "delete",
        savedSessionId: readUuid(record.savedSessionId),
        expectedRevision: readInteger(
          record.expectedRevision,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      };
    default:
      throw new SavedSessionValidationError();
  }
}

function parseDraft(value: unknown): SavedSessionDraft {
  const record = readRecord(value);
  const { activities, ...rest } = record;
  if (
    !Array.isArray(activities) ||
    activities.length > SAVED_SESSION_ACTIVITY_LIMIT
  ) {
    throw new SavedSessionValidationError();
  }
  const positions = new Set<number>();
  return {
    ...parseContent(rest),
    activities: activities.map((activity) => {
      const parsed = parseActivity(activity);
      if (positions.has(parsed.position))
        throw new SavedSessionValidationError();
      positions.add(parsed.position);
      return parsed;
    }),
  };
}

function parseContent(value: unknown): SavedSessionContent {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "name",
    "title",
    "sport",
    "intent",
    "expectedDurationMinutes",
    "note",
  ]);
  return {
    name: readRequiredString(record.name, 120),
    title: readRequiredString(record.title, 120),
    sport: readRequiredString(record.sport, 80),
    ...optionalString("intent", record.intent, 500),
    ...(record.expectedDurationMinutes === undefined ||
    record.expectedDurationMinutes === null
      ? {}
      : {
          expectedDurationMinutes: readInteger(
            record.expectedDurationMinutes,
            1,
            10080,
          ),
        }),
    ...optionalString("note", record.note, 2000),
  };
}

function parseActivity(value: unknown): SavedSessionActivity {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "personalActivityId",
    "position",
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
        throw new SavedSessionValidationError();
      throw error;
    }
  }
  return {
    ...(record.personalActivityId === undefined ||
    record.personalActivityId === null
      ? {}
      : { personalActivityId: readUuid(record.personalActivityId) }),
    position: readInteger(record.position, 0, 99),
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
    throw new SavedSessionValidationError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new SavedSessionValidationError();
}

function readRequiredString(value: unknown, max: number) {
  if (typeof value !== "string") throw new SavedSessionValidationError();
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max)
    throw new SavedSessionValidationError();
  return normalized;
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
  max: number,
): Partial<Record<K, string>> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || value.length > max)
    throw new SavedSessionValidationError();
  return { [key]: value } as Record<K, string>;
}

function readInteger(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new SavedSessionValidationError();
  }
  return value;
}

function readUuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new SavedSessionValidationError();
  }
  return value.toLowerCase();
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new SavedSessionValidationError();
  return value as T[number];
}
