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

/** How Postgres numbers weekdays: 0 is Sunday through 6 is Saturday. */
export type RollingPlanWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A series template's activity. It carries no Plan lock for the same reason a
 * saved session's does not: a lock belongs to a dated session, not to a rule.
 */
export type RollingPlanSeriesActivityInput = Omit<
  RollingPlanActivityInput,
  "isLocked"
>;

/**
 * One effective-dated segment: the recurrence rule and the session template it
 * stamps out. `endDate` absent is an explicitly open-ended series; expansion is
 * still bounded, because only the fourteen-day window is ever asked for.
 */
export type RollingPlanSeriesInput = {
  frequency: "daily" | "weekly";
  intervalCount: number;
  /** Weekly only, ascending and distinct. */
  weekdays?: RollingPlanWeekday[];
  startDate: string;
  endDate?: string;
  title: string;
  sport: string;
  intent?: string;
  expectedDurationMinutes?: number;
  note?: string;
  activities: RollingPlanSeriesActivityInput[];
};

/** One stored effective-dated segment, returned through owner-scoped reads. */
export type RollingPlanSeries = RollingPlanSeriesInput & {
  id: string;
  predecessorSeriesId: string | null;
};

export type RollingPlanChange =
  | { operation: "add"; sessionId: string; session: RollingPlanSessionInput }
  | {
      operation: "add_series";
      seriesId: string;
      series: RollingPlanSeriesInput;
    }
  | {
      /**
       * Without `effectiveDate` this rewrites the whole segment, which is only
       * offered before it starts. With one it closes the segment on the day
       * before and opens `successorSeriesId` on it, leaving every earlier
       * occurrence exactly as it was.
       */
      operation: "edit_series";
      seriesId: string;
      effectiveDate?: string;
      successorSeriesId?: string;
      series: RollingPlanSeriesInput;
    }
  | { operation: "end_series"; seriesId: string; effectiveDate: string }
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
  | { operation: "cancel"; sessionId: string }
  | {
      operation: "set_recovery_day";
      localDate: string;
      isRecoveryDay: boolean;
    };

export type RollingPlanChangeSet = {
  idempotencyKey: string;
  provenance: string;
  changes: RollingPlanChange[];
};

export type RollingPlanActivity = RollingPlanActivityInput & { id: string };

/**
 * What makes a session an occurrence of a rule. All three are null or false on
 * a one-off session, which is how a Plan written before recurrence existed
 * reads exactly as it did.
 */
export type RollingPlanOccurrenceIdentity = {
  seriesId: string | null;
  /** The rule date that produced it, which a move does not change. */
  occurrenceDate: string | null;
  /** True once the owner has changed this occurrence away from its rule. */
  hasDiverged: boolean;
};

export type RollingPlanSession = Omit<RollingPlanSessionInput, "activities"> &
  RollingPlanOccurrenceIdentity & {
    id: string;
    status: "active" | "cancelled";
    cancelledAt: string | null;
    activities: RollingPlanActivity[];
  };

export type RollingPlanSlice = {
  planId: string | null;
  revision: number;
  sessions: RollingPlanSession[];
  /** Dates inside the window the owner labelled Recovery day, ascending. */
  recoveryDates: string[];
};

/**
 * What one series operation did to the occurrences already on the Plan.
 * `lockedKept` is the count a locked occurrence saved from removal, which the
 * owner has to be told about because nothing else on the Plan will show it.
 */
export type RollingPlanSeriesEffect = {
  seriesId: string;
  operation: "edit_series" | "end_series";
  deleted: number;
  divergedDeleted: number;
  lockedKept: number;
};

export type RollingPlanChangeReceipt = {
  planId: string;
  planRevision: number;
  changeSetId: string;
  result: "applied" | "replayed";
  seriesEffects: RollingPlanSeriesEffect[];
};

/** A rule date the window could not take, and why. */
export type RollingPlanSkippedOccurrence = {
  seriesId: string;
  occurrenceDate: string;
  reason: "daily-session-limit" | "change-set-limit";
};

export type RollingPlanMaterializationReceipt = {
  planId: string | null;
  planRevision: number;
  changeSetId: string | null;
  /** `unchanged` means nothing was missing and the revision did not move. */
  result: "applied" | "replayed" | "unchanged";
  createdCount: number;
  skipped: RollingPlanSkippedOccurrence[];
};

export type ParsedPlanSlice = { startDate: string; endDate: string };

export interface RollingPlanAdapter {
  getPlanSlice(input: ParsedPlanSlice): Promise<RollingPlanSlice>;
  listSeries(): Promise<RollingPlanSeries[]>;
  applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ): Promise<RollingPlanChangeReceipt>;
  materializeSeries(
    idempotencyKey: string,
    expectedPlanRevision: number,
  ): Promise<RollingPlanMaterializationReceipt>;
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

/** The most active sessions one owner-local date may hold. Labels never count. */
export const ROLLING_PLAN_DAILY_SESSION_LIMIT = 10;

/**
 * The owner-local window a series is materialized into: today plus the next
 * thirteen days. ADR-017 consequence 3 - nothing outside it exists as a row.
 */
export const ROLLING_PLAN_WINDOW_DAYS = 14;

/** The most changes one change set carries, which bounds one materialization. */
export const ROLLING_PLAN_CHANGE_SET_LIMIT = 100;

export type RollingPlanRuleReason =
  | "past-date"
  | "daily-session-limit"
  /** A whole-series edit was attempted after the segment already started. */
  | "series-already-started";

/**
 * A change that parsed and was authorized, but breaks a planning rule the
 * adapter enforces against stored state and owner-local today.
 */
export class RollingPlanRuleError extends Error {
  constructor(readonly reason: RollingPlanRuleReason) {
    super("The rolling plan change breaks a planning rule.");
    this.name = "RollingPlanRuleError";
  }
}

/** Owner-local today is unknown, so neither planning rule can be judged. */
export class RollingPlanTimezoneRequiredError extends Error {
  constructor() {
    super("The owner has no stored time zone.");
    this.name = "RollingPlanTimezoneRequiredError";
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

  async listSeries() {
    return await this.adapter.listSeries();
  }

  async applyChangeSet(changeSet: unknown, expectedPlanRevision: unknown) {
    return await this.adapter.applyChangeSet(
      parseChangeSet(changeSet),
      readInteger(expectedPlanRevision, 0, Number.MAX_SAFE_INTEGER),
    );
  }

  /**
   * Tops the window up with the occurrences every active series is missing.
   * It is a write, so it is called from a Server Action and never from a read;
   * it returns `unchanged` without advancing the revision when nothing is
   * missing, so two open tabs do not fight over the revision.
   */
  async materializeSeries(
    idempotencyKey: unknown,
    expectedPlanRevision: unknown,
  ) {
    return await this.adapter.materializeSeries(
      readUuid(idempotencyKey),
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
  // A label belongs to a date, not to a session identity, so it is the one
  // change that carries no session id.
  if (operation === "set_recovery_day") {
    assertOnlyKeys(record, ["operation", "localDate", "isRecoveryDay"]);
    if (typeof record.isRecoveryDay !== "boolean")
      throw new RollingPlanValidationError();
    return {
      operation,
      localDate: readIsoDate(record.localDate),
      isRecoveryDay: record.isRecoveryDay,
    };
  }
  // A series operation targets a rule, not a session identity.
  if (operation === "add_series") {
    assertOnlyKeys(record, ["operation", "seriesId", "series"]);
    return {
      operation,
      seriesId: readUuid(record.seriesId),
      series: parseSeries(record.series),
    };
  }
  if (operation === "edit_series") {
    const seriesId = readUuid(record.seriesId);
    const series = parseSeries(record.series);
    if (record.effectiveDate === undefined) {
      assertOnlyKeys(record, ["operation", "seriesId", "series"]);
      return { operation, seriesId, series };
    }
    assertOnlyKeys(record, [
      "operation",
      "seriesId",
      "series",
      "effectiveDate",
      "successorSeriesId",
    ]);
    const effectiveDate = readIsoDate(record.effectiveDate);
    // The successor starts on the split date. Sending a different one would
    // silently mean something else, so it is refused rather than corrected.
    if (series.startDate !== effectiveDate)
      throw new RollingPlanValidationError();
    return {
      operation,
      seriesId,
      effectiveDate,
      successorSeriesId: readUuid(record.successorSeriesId),
      series,
    };
  }
  if (operation === "end_series") {
    assertOnlyKeys(record, ["operation", "seriesId", "effectiveDate"]);
    return {
      operation,
      seriesId: readUuid(record.seriesId),
      effectiveDate: readIsoDate(record.effectiveDate),
    };
  }
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

function parseSeries(value: unknown): RollingPlanSeriesInput {
  const record = readRecord(value);
  assertOnlyKeys(record, [
    "frequency",
    "intervalCount",
    "weekdays",
    "startDate",
    "endDate",
    "title",
    "sport",
    "intent",
    "expectedDurationMinutes",
    "note",
    "activities",
  ]);
  const frequency = readChoice(record.frequency, ["daily", "weekly"] as const);
  const startDate = readIsoDate(record.startDate);
  const endDate =
    record.endDate === undefined || record.endDate === null
      ? undefined
      : readIsoDate(record.endDate);
  if (endDate !== undefined && endDate < startDate)
    throw new RollingPlanValidationError();
  if (!Array.isArray(record.activities) || record.activities.length > 50) {
    throw new RollingPlanValidationError();
  }
  const positions = new Set<number>();
  const activities = record.activities.map((activity) => {
    const raw = readRecord(activity);
    // A template activity carries no Plan lock, so naming one is a mistake
    // rather than something to quietly normalize away.
    if ("isLocked" in raw) throw new RollingPlanValidationError();
    const { isLocked, ...parsed } = parseActivity({ ...raw, isLocked: false });
    void isLocked;
    if (positions.has(parsed.position)) throw new RollingPlanValidationError();
    positions.add(parsed.position);
    return parsed;
  });
  return {
    frequency,
    ...parseRecurrence(frequency, record.intervalCount, record.weekdays),
    startDate,
    ...(endDate === undefined ? {} : { endDate }),
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
}

/**
 * The two supported shapes, and only those: every N days from one to 365, or
 * every N weeks from one to 52 on named weekdays. No monthly, yearly, ordinal
 * or arbitrary recurrence language exists here to be smuggled in.
 */
function parseRecurrence(
  frequency: "daily" | "weekly",
  intervalCount: unknown,
  weekdays: unknown,
) {
  if (frequency === "daily") {
    if (weekdays !== undefined) throw new RollingPlanValidationError();
    return { intervalCount: readInteger(intervalCount, 1, 365) };
  }
  if (!Array.isArray(weekdays) || weekdays.length < 1 || weekdays.length > 7) {
    throw new RollingPlanValidationError();
  }
  const named = new Set<number>();
  for (const weekday of weekdays) {
    const parsed = readInteger(weekday, 0, 6);
    if (named.has(parsed)) throw new RollingPlanValidationError();
    named.add(parsed);
  }
  return {
    intervalCount: readInteger(intervalCount, 1, 52),
    weekdays: [...named].toSorted(
      (left, right) => left - right,
    ) as RollingPlanWeekday[],
  };
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
