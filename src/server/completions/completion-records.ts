import "server-only";

import {
  COMPLETION_FEELINGS,
  COMPLETION_STATUSES,
  type CompletionActivityInput,
  type CompletionInput,
} from "@/features/completions/completion-types";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
  TrainingRecordValidationError,
  type TrainingMeasurementMode,
} from "@/server/training/training-records";

export class CompletionValidationError extends Error {
  constructor() {
    super("The completion is invalid.");
    this.name = "CompletionValidationError";
  }
}

export function parseCompletionInput(value: unknown): CompletionInput {
  try {
    const record = readRecord(value);
    assertOnlyKeys(record, [
      "idempotencyKey",
      "completionGroupId",
      "expectedRevision",
      "plannedSessionId",
      "actualLocalDate",
      "actualStartedAt",
      "timezoneName",
      "durationMinutes",
      "status",
      "perceivedEffort",
      "feeling",
      "note",
      "replacementDescription",
      "painReported",
      "illnessReported",
      "injuryReported",
      "severeFatigueReported",
      "correctionReason",
      "activities",
    ]);

    const status = readChoice(record.status, COMPLETION_STATUSES);
    const plannedSessionId = readOptionalUuid(record.plannedSessionId);
    const completionGroupId = readOptionalUuid(record.completionGroupId);
    const expectedRevision = readInteger(record.expectedRevision, 0, 1000000);
    const correctionReason = readOptionalString(record.correctionReason, 500);
    const replacementDescription = readOptionalString(
      record.replacementDescription,
      500,
    );

    if (status === "unplanned" ? plannedSessionId : !plannedSessionId) {
      throw new CompletionValidationError();
    }
    if (
      status === "replaced"
        ? !replacementDescription
        : replacementDescription !== undefined
    ) {
      throw new CompletionValidationError();
    }
    if (
      completionGroupId
        ? expectedRevision < 1 || !correctionReason
        : expectedRevision !== 0 || correctionReason !== undefined
    ) {
      throw new CompletionValidationError();
    }

    if (!Array.isArray(record.activities) || record.activities.length > 50) {
      throw new CompletionValidationError();
    }
    const positions = new Set<number>();
    const activities = record.activities.map((item) => {
      const activity = parseActivity(item);
      if (positions.has(activity.position)) {
        throw new CompletionValidationError();
      }
      positions.add(activity.position);
      return activity;
    });

    return {
      idempotencyKey: readUuid(record.idempotencyKey),
      completionGroupId,
      expectedRevision,
      plannedSessionId,
      actualLocalDate: readIsoDate(record.actualLocalDate),
      actualStartedAt: readOptionalTimestamp(record.actualStartedAt),
      timezoneName: readTimezone(record.timezoneName),
      durationMinutes: readOptionalInteger(record.durationMinutes, 0, 10080),
      status,
      perceivedEffort: readOptionalInteger(record.perceivedEffort, 1, 10),
      feeling:
        record.feeling === undefined || record.feeling === null
          ? undefined
          : readChoice(record.feeling, COMPLETION_FEELINGS),
      note: readOptionalString(record.note, 2000),
      replacementDescription,
      painReported: readBoolean(record.painReported),
      illnessReported: readBoolean(record.illnessReported),
      injuryReported: readBoolean(record.injuryReported),
      severeFatigueReported: readBoolean(record.severeFatigueReported),
      correctionReason,
      activities,
    };
  } catch (error) {
    if (
      error instanceof CompletionValidationError ||
      error instanceof TrainingRecordValidationError
    ) {
      throw new CompletionValidationError();
    }
    throw error;
  }
}

function parseActivity(value: unknown): CompletionActivityInput {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "plannedActivityId",
    "personalActivityId",
    "position",
    "name",
    "sport",
    "instructions",
    "measurementMode",
    "actualMeasurement",
  ]);
  const measurementMode = readChoice(
    record.measurementMode,
    TRAINING_MEASUREMENT_MODES,
  ) as TrainingMeasurementMode;
  const actualMeasurement =
    record.actualMeasurement === undefined || record.actualMeasurement === null
      ? undefined
      : parseTrainingMeasurement(measurementMode, record.actualMeasurement);

  return {
    plannedActivityId: readOptionalUuid(record.plannedActivityId),
    personalActivityId: readOptionalUuid(record.personalActivityId),
    position: readInteger(record.position, 0, 99),
    name: readRequiredString(record.name, 120),
    sport: readRequiredString(record.sport, 80),
    instructions: readOptionalString(record.instructions, 2000),
    measurementMode,
    actualMeasurement,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new CompletionValidationError();
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new CompletionValidationError();
  }
}

function readRequiredString(value: unknown, max: number): string {
  if (typeof value !== "string") throw new CompletionValidationError();
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new CompletionValidationError();
  }
  return normalized;
}

function readOptionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new CompletionValidationError();
  }
  return value.trim() || undefined;
}

function readInteger(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new CompletionValidationError();
  }
  return value;
}

function readOptionalInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return value === undefined || value === null
    ? undefined
    : readInteger(value, min, max);
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new CompletionValidationError();
  return value;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new CompletionValidationError();
  }
  return value as T[number];
}

function readUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new CompletionValidationError();
  }
  return value.toLowerCase();
}

function readOptionalUuid(value: unknown): string | undefined {
  return value === undefined || value === null || value === ""
    ? undefined
    : readUuid(value);
}

function readIsoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CompletionValidationError();
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new CompletionValidationError();
  }
  return value;
}

function readOptionalTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    Number.isNaN(new Date(value).valueOf()) ||
    value.length > 64
  ) {
    throw new CompletionValidationError();
  }
  return new Date(value).toISOString();
}

function readTimezone(value: unknown): string {
  const timezone = readRequiredString(value, 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new CompletionValidationError();
  }
  return timezone;
}
