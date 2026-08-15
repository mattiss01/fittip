import "server-only";

import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
  TrainingMeasurementValidationError,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

export type RollingPlanActivityInput = {
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
  isLocked: boolean;
};

export type RollingPlanSessionContent = {
  title: string;
  sport: string;
  intent?: string;
  expectedDurationMinutes?: number;
  note?: string;
  activities: RollingPlanActivityInput[];
};

export type RollingPlanSessionInput = RollingPlanSessionContent & {
  localDate: string;
  position: number;
  isLocked: boolean;
};

export type RollingPlanChange =
  | { operation: "add"; sessionId: string; session: RollingPlanSessionInput }
  | {
      operation: "edit";
      sessionId: string;
      session: RollingPlanSessionContent;
    }
  | {
      operation: "move";
      sessionId: string;
      localDate: string;
      position: number;
    }
  | { operation: "set_lock"; sessionId: string; isLocked: boolean }
  | { operation: "cancel"; sessionId: string };

export type RollingPlanChangeSet = {
  idempotencyKey: string;
  provenance: string;
  changes: RollingPlanChange[];
};

export type RollingPlanActivity = RollingPlanActivityInput & { id: string };
export type RollingPlanSession = Omit<RollingPlanSessionInput, "activities"> & {
  id: string;
  status: "active" | "cancelled";
  cancelledAt: string | null;
  activities: RollingPlanActivity[];
};

export type RollingPlanSlice = {
  planId: string | null;
  revision: number;
  sessions: RollingPlanSession[];
};

export type RollingPlanChangeReceipt = {
  planId: string;
  planRevision: number;
  changeSetId: string;
  result: "applied" | "replayed";
};

export type ParsedPlanSlice = { startDate: string; endDate: string };

export interface RollingPlanAdapter {
  getPlanSlice(input: ParsedPlanSlice): Promise<RollingPlanSlice>;
  applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ): Promise<RollingPlanChangeReceipt>;
}

export class RollingPlanValidationError extends Error {
  constructor() {
    super("The rolling plan change is invalid.");
    this.name = "RollingPlanValidationError";
  }
}

export class RollingPlanConflictError extends Error {
  constructor() {
    super("The rolling plan changed before this save.");
    this.name = "RollingPlanConflictError";
  }
}

export class RollingPlanPersistenceError extends Error {
  constructor() {
    super("The rolling plan operation could not be completed.");
    this.name = "RollingPlanPersistenceError";
  }
}

/** The small external interface; persistence mechanics stay behind its adapter seam. */
export class RollingPlan {
  constructor(private readonly adapter: RollingPlanAdapter) {}

  async getPlanSlice(startDate: unknown, endDate: unknown) {
    const start = readIsoDate(startDate);
    const end = readIsoDate(endDate);
    if (end < start) throw new RollingPlanValidationError();
    return await this.adapter.getPlanSlice({ startDate: start, endDate: end });
  }

  async applyChangeSet(changeSet: unknown, expectedPlanRevision: unknown) {
    return await this.adapter.applyChangeSet(
      parseChangeSet(changeSet),
      readInteger(expectedPlanRevision, 0, Number.MAX_SAFE_INTEGER),
    );
  }
}

export function parseChangeSet(value: unknown): RollingPlanChangeSet {
  const record = readRecord(value);
  assertOnlyKeys(record, ["idempotencyKey", "provenance", "changes"]);
  if (
    !Array.isArray(record.changes) ||
    record.changes.length < 1 ||
    record.changes.length > 100
  ) {
    throw new RollingPlanValidationError();
  }
  const provenance = readRequiredString(record.provenance, 64);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(provenance))
    throw new RollingPlanValidationError();
  return {
    idempotencyKey: readUuid(record.idempotencyKey),
    provenance,
    changes: record.changes.map(parseChange),
  };
}

function parseChange(value: unknown): RollingPlanChange {
  const record = readRecord(value);
  const operation = record.operation;
  const sessionId = readUuid(record.sessionId);
  switch (operation) {
    case "add":
      assertOnlyKeys(record, ["operation", "sessionId", "session"]);
      return {
        operation,
        sessionId,
        session: parseSession(record.session, true),
      };
    case "edit":
      assertOnlyKeys(record, ["operation", "sessionId", "session"]);
      return {
        operation,
        sessionId,
        session: parseSession(record.session, false),
      };
    case "move":
      assertOnlyKeys(record, [
        "operation",
        "sessionId",
        "localDate",
        "position",
      ]);
      return {
        operation,
        sessionId,
        localDate: readIsoDate(record.localDate),
        position: readInteger(record.position, 0, 99),
      };
    case "set_lock":
      assertOnlyKeys(record, ["operation", "sessionId", "isLocked"]);
      if (typeof record.isLocked !== "boolean")
        throw new RollingPlanValidationError();
      return { operation, sessionId, isLocked: record.isLocked };
    case "cancel":
      assertOnlyKeys(record, ["operation", "sessionId"]);
      return { operation, sessionId };
    default:
      throw new RollingPlanValidationError();
  }
}

function parseSession(
  value: unknown,
  withPlacement: true,
): RollingPlanSessionInput;
function parseSession(
  value: unknown,
  withPlacement: false,
): RollingPlanSessionContent;
function parseSession(value: unknown, withPlacement: boolean) {
  const record = readRecord(value);
  const contentKeys = [
    "title",
    "sport",
    "intent",
    "expectedDurationMinutes",
    "note",
    "activities",
  ];
  assertOnlyKeys(
    record,
    withPlacement
      ? [...contentKeys, "localDate", "position", "isLocked"]
      : contentKeys,
  );
  if (!Array.isArray(record.activities) || record.activities.length > 50) {
    throw new RollingPlanValidationError();
  }
  const positions = new Set<number>();
  const activities = record.activities.map((activity) => {
    const parsed = parseActivity(activity);
    if (positions.has(parsed.position)) throw new RollingPlanValidationError();
    positions.add(parsed.position);
    return parsed;
  });
  const content: RollingPlanSessionContent = {
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
    activities,
  };
  if (!withPlacement) return content;
  if (typeof record.isLocked !== "boolean")
    throw new RollingPlanValidationError();
  return {
    ...content,
    localDate: readIsoDate(record.localDate),
    position: readInteger(record.position, 0, 99),
    isLocked: record.isLocked,
  };
}

function parseActivity(value: unknown): RollingPlanActivityInput {
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
  const measurementMode = readChoice(
    record.measurementMode,
    TRAINING_MEASUREMENT_MODES,
  );
  if (typeof record.isLocked !== "boolean")
    throw new RollingPlanValidationError();
  let target: TrainingMeasurement | undefined;
  if (record.target !== undefined && record.target !== null) {
    try {
      target = parseTrainingMeasurement(measurementMode, record.target);
    } catch (error) {
      if (error instanceof TrainingMeasurementValidationError)
        throw new RollingPlanValidationError();
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
    isLocked: record.isLocked,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new RollingPlanValidationError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new RollingPlanValidationError();
}

function readRequiredString(value: unknown, max: number) {
  if (typeof value !== "string") throw new RollingPlanValidationError();
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max)
    throw new RollingPlanValidationError();
  return normalized;
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
  max: number,
): Partial<Record<K, string>> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || value.length > max)
    throw new RollingPlanValidationError();
  return { [key]: value } as Record<K, string>;
}

function readInteger(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new RollingPlanValidationError();
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
    throw new RollingPlanValidationError();
  }
  return value.toLowerCase();
}

function readIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RollingPlanValidationError();
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new RollingPlanValidationError();
  return value;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new RollingPlanValidationError();
  return value as T[number];
}
