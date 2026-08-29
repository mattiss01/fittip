import "server-only";

import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
  TrainingMeasurementValidationError,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/server/training/training-measurements";

/**
 * The five outcomes a completion may record. There is no `rest`: F-005 defines
 * Recovery day as a day-level planning label that is not a session, so its
 * factual counterpart is a skipped planned session or simply no completion.
 */
export const COMPLETION_STATUSES = [
  "completed",
  "partially_completed",
  "skipped",
  "replaced",
  "unplanned",
] as const;

export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const COMPLETION_FEELINGS = [
  "very_bad",
  "bad",
  "neutral",
  "good",
  "very_good",
] as const;

export type CompletionFeeling = (typeof COMPLETION_FEELINGS)[number];

/** What one activity of a session actually was. */
export type CompletionActivity = {
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  /** No capture path exists yet; the schema carries it from M3-15A onward. */
  actualMeasurement?: TrainingMeasurement;
};

/** One planned activity as it stood when the completion was written. */
export type CompletionPlannedActivity = {
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
};

/**
 * The planned session as it stood when the completion was written. It is a
 * copy, never a read through to the live plan row: the plan side is mutable, so
 * reading through would silently rewrite what the completion appears to have
 * been measured against. F-005 Review history step 4 depends on this.
 */
export type CompletionPlannedSnapshot = {
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent?: string;
  expectedDurationMinutes?: number;
  note?: string;
  isLocked: boolean;
  status: "active" | "cancelled";
  seriesId: string | null;
  occurrenceDate: string | null;
  activities: CompletionPlannedActivity[];
};

/** Everything an owner records about what happened, minus identity and link. */
export type CompletionFacts = {
  status: CompletionStatus;
  actualLocalDate: string;
  actualStartedAt?: string;
  durationMinutes?: number;
  perceivedEffort?: number;
  feeling?: CompletionFeeling;
  note?: string;
  /** Present exactly when the status is `replaced`. */
  replacementDescription?: string;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
};

export type CompletionDraft = CompletionFacts & {
  /** Absent exactly when the status is `unplanned`. */
  planSessionId?: string;
  activities: CompletionActivity[];
};

export type Completion = CompletionFacts & {
  id: string;
  planSessionId: string | null;
  /**
   * The zone the local date was anchored in when the record was written. It is
   * kept per record because the profile zone changes and a past date must not
   * move with it.
   */
  timezoneName: string;
  plannedSnapshot: CompletionPlannedSnapshot | null;
  /**
   * The optimistic token the surface reads and sends back. It is not a revision
   * chain: no prior version is retained and none can be browsed.
   */
  revision: number;
  activities: CompletionActivity[];
  updatedAt: string;
};

export type CompletionChange =
  | { operation: "create"; completion: CompletionDraft }
  | {
      operation: "edit";
      completionId: string;
      expectedRevision: number;
      completion: CompletionFacts;
    };

export type CompletionReceipt = {
  completionId: string;
  revision: number;
  result: "created" | "updated";
};

/** The owner-local date range one read covers, both ends inclusive. */
export type ParsedCompletionWindow = { startDate: string; endDate: string };

export interface CompletionLogAdapter {
  list(window: ParsedCompletionWindow): Promise<Completion[]>;
  get(completionId: string): Promise<Completion | null>;
  applyChange(change: CompletionChange): Promise<CompletionReceipt>;
}

export class CompletionValidationError extends Error {
  constructor() {
    super("The completion is invalid.");
    this.name = "CompletionValidationError";
  }
}

/** The record changed, or no longer exists, since the owner read it. */
export class CompletionConflictError extends Error {
  constructor() {
    super("The completion changed before this write.");
    this.name = "CompletionConflictError";
  }
}

/** Owner-local today is unknown, so no local date can be anchored. */
export class CompletionTimezoneRequiredError extends Error {
  constructor() {
    super("The owner has no stored time zone.");
    this.name = "CompletionTimezoneRequiredError";
  }
}

export class CompletionPersistenceError extends Error {
  constructor() {
    super("The completion operation could not be completed.");
    this.name = "CompletionPersistenceError";
  }
}

/** The most activities one completion may carry, as for a planned session. */
export const COMPLETION_ACTIVITY_LIMIT = 50;

/** The small external interface; persistence stays behind the adapter seam. */
export class CompletionLog {
  constructor(private readonly adapter: CompletionLogAdapter) {}

  /** Owner history over a bounded window, most recent first. */
  async list(startDate: unknown, endDate: unknown): Promise<Completion[]> {
    const start = readIsoDate(startDate);
    const end = readIsoDate(endDate);
    if (end < start) throw new CompletionValidationError();
    return await this.adapter.list({ startDate: start, endDate: end });
  }

  async get(completionId: unknown): Promise<Completion | null> {
    return await this.adapter.get(readUuid(completionId));
  }

  async applyChange(change: unknown): Promise<CompletionReceipt> {
    return await this.adapter.applyChange(parseCompletionChange(change));
  }
}

export function parseCompletionChange(value: unknown): CompletionChange {
  const record = readRecord(value);
  switch (record.operation) {
    case "create":
      assertOnlyKeys(record, ["operation", "completion"]);
      return { operation: "create", completion: parseDraft(record.completion) };
    case "edit":
      assertOnlyKeys(record, [
        "operation",
        "completionId",
        "expectedRevision",
        "completion",
      ]);
      return {
        operation: "edit",
        completionId: readUuid(record.completionId),
        expectedRevision: readInteger(
          record.expectedRevision,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        completion: parseFacts(record.completion),
      };
    default:
      throw new CompletionValidationError();
  }
}

function parseDraft(value: unknown): CompletionDraft {
  const record = readRecord(value);
  const { planSessionId, activities, ...rest } = record;
  if (
    !Array.isArray(activities) ||
    activities.length > COMPLETION_ACTIVITY_LIMIT
  ) {
    throw new CompletionValidationError();
  }
  const facts = parseFacts(rest);
  const named = planSessionId === undefined || planSessionId === null;
  // `unplanned` means exactly "no planned session", in both directions. A
  // completion that named one and called itself unplanned would be a record
  // nothing could read consistently, so it is refused rather than corrected.
  if (named !== (facts.status === "unplanned")) {
    throw new CompletionValidationError();
  }
  const positions = new Set<number>();
  return {
    ...facts,
    ...(named ? {} : { planSessionId: readUuid(planSessionId) }),
    activities: activities.map((activity) => {
      const parsed = parseActivity(activity);
      if (positions.has(parsed.position)) throw new CompletionValidationError();
      positions.add(parsed.position);
      return parsed;
    }),
  };
}

function parseFacts(value: unknown): CompletionFacts {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "status",
    "actualLocalDate",
    "actualStartedAt",
    "durationMinutes",
    "perceivedEffort",
    "feeling",
    "note",
    "replacementDescription",
    "painReported",
    "illnessReported",
    "injuryReported",
    "severeFatigueReported",
  ]);
  const status = readChoice(record.status, COMPLETION_STATUSES);
  const replacementDescription =
    record.replacementDescription === undefined ||
    record.replacementDescription === null ||
    record.replacementDescription === ""
      ? undefined
      : readRequiredString(record.replacementDescription, 500);
  // `replaced` means exactly "there is a description of what was done
  // instead", in both directions.
  if ((status === "replaced") !== (replacementDescription !== undefined)) {
    throw new CompletionValidationError();
  }
  return {
    status,
    actualLocalDate: readIsoDate(record.actualLocalDate),
    ...(record.actualStartedAt === undefined || record.actualStartedAt === null
      ? {}
      : { actualStartedAt: readTimestamp(record.actualStartedAt) }),
    ...optionalInteger("durationMinutes", record.durationMinutes, 0, 10080),
    ...optionalInteger("perceivedEffort", record.perceivedEffort, 1, 10),
    ...(record.feeling === undefined || record.feeling === null
      ? {}
      : { feeling: readChoice(record.feeling, COMPLETION_FEELINGS) }),
    ...optionalString("note", record.note, 2000),
    ...(replacementDescription === undefined ? {} : { replacementDescription }),
    painReported: readFlag(record.painReported),
    illnessReported: readFlag(record.illnessReported),
    injuryReported: readFlag(record.injuryReported),
    severeFatigueReported: readFlag(record.severeFatigueReported),
  };
}

function parseActivity(value: unknown): CompletionActivity {
  const record = readRecord(value);
  assertOnlyKeys(record, [
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
  );
  return {
    ...(record.personalActivityId === undefined ||
    record.personalActivityId === null
      ? {}
      : { personalActivityId: readUuid(record.personalActivityId) }),
    position: readInteger(record.position, 0, 99),
    name: readRequiredString(record.name, 120),
    sport: readRequiredString(record.sport, 80),
    ...optionalString("instructions", record.instructions, 2000),
    ...(record.actualMeasurement === undefined ||
    record.actualMeasurement === null
      ? {}
      : {
          actualMeasurement: readMeasurement(
            measurementMode,
            record.actualMeasurement,
          ),
        }),
    measurementMode,
  };
}

function readMeasurement(
  mode: TrainingMeasurementMode,
  value: unknown,
): TrainingMeasurement {
  try {
    return parseTrainingMeasurement(mode, value);
  } catch (error) {
    if (error instanceof TrainingMeasurementValidationError)
      throw new CompletionValidationError();
    throw error;
  }
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
  record: Record<string, unknown>,
  keys: readonly string[],
) {
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new CompletionValidationError();
}

function readRequiredString(value: unknown, max: number) {
  if (typeof value !== "string") throw new CompletionValidationError();
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max)
    throw new CompletionValidationError();
  return normalized;
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
  max: number,
): Partial<Record<K, string>> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || value.length > max)
    throw new CompletionValidationError();
  return { [key]: value } as Record<K, string>;
}

function optionalInteger<K extends string>(
  key: K,
  value: unknown,
  min: number,
  max: number,
): Partial<Record<K, number>> {
  if (value === undefined || value === null) return {};
  return { [key]: readInteger(value, min, max) } as Record<K, number>;
}

function readFlag(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw new CompletionValidationError();
  return value;
}

function readInteger(value: unknown, min: number, max: number) {
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

function readUuid(value: unknown) {
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

function readIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new CompletionValidationError();
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new CompletionValidationError();
  }
  return value;
}

/** An instant, normalized so two adapters cannot disagree on its spelling. */
function readTimestamp(value: unknown) {
  if (typeof value !== "string") throw new CompletionValidationError();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new CompletionValidationError();
  return parsed.toISOString();
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new CompletionValidationError();
  return value as T[number];
}
