import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanPersistenceError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type ParsedPlanSlice,
  type RollingPlanActivity,
  type RollingPlanAdapter,
  type RollingPlanChangeReceipt,
  type RollingPlanChangeSet,
  type RollingPlanMaterializationReceipt,
  type RollingPlanSeriesEffect,
  type RollingPlanSeries,
  type RollingPlanSeriesActivityInput,
  type RollingPlanSession,
  type RollingPlanSkippedOccurrence,
  type RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

type RollingPlanClient = SupabaseClient<Database> | ServerUserClient;

const ROLLING_PLAN_SERIES_COLUMNS = `
  id, predecessor_series_id, frequency, interval_count, weekdays, start_date,
  end_date, title, sport, intent, expected_duration_minutes, note, created_at,
  rolling_plan_series_activities (
    personal_activity_id, position, name, sport, instructions,
    measurement_mode, target
  )
` as const;

export class RollingPlanAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "RollingPlanAuthenticationError";
  }
}

/** Postgres adapter at the rolling-plan seam. It never accepts an owner id. */
export class PostgresRollingPlanAdapter implements RollingPlanAdapter {
  constructor(private readonly client: RollingPlanClient) {}

  async getPlanSlice({ startDate, endDate }: ParsedPlanSlice) {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc("get_rolling_plan_slice", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw new RollingPlanPersistenceError();
    return parseSliceReceipt(data);
  }

  async listSeries(): Promise<RollingPlanSeries[]> {
    const userId = await this.getVerifiedUserId();
    // RLS confines the read already; the explicit predicate keeps ownership a
    // property of the repository call rather than only of its backstop.
    const { data, error } = await this.client
      .from("rolling_plan_series")
      .select(ROLLING_PLAN_SERIES_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new RollingPlanPersistenceError();
    return (data ?? []).map(parseSeries);
  }

  async applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ): Promise<RollingPlanChangeReceipt> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_rolling_plan_change_set", {
        p_expected_plan_revision: expectedPlanRevision,
        p_idempotency_key: changeSet.idempotencyKey,
        p_provenance: changeSet.provenance,
        p_changes: changeSet.changes as unknown as Json,
      })
      .retry(false);
    if (error) {
      // The rule codes are raised only by `apply_rolling_plan_change_set`, so
      // each maps to one honest, recoverable owner-facing outcome.
      if (error.code === "PT409") throw new RollingPlanConflictError();
      if (error.code === "PT422") throw new RollingPlanRuleError("past-date");
      if (error.code === "PT423")
        throw new RollingPlanRuleError("daily-session-limit");
      if (error.code === "PT424")
        throw new RollingPlanRuleError("series-already-started");
      if (error.code === "PT428") throw new RollingPlanTimezoneRequiredError();
      if (error.code === "22023") throw new RollingPlanValidationError();
      throw new RollingPlanPersistenceError();
    }
    const result = data?.result;
    if (
      !data ||
      data.plan_id === null ||
      data.plan_revision === null ||
      data.change_set_id === null ||
      (result !== "applied" && result !== "replayed")
    ) {
      throw new RollingPlanPersistenceError();
    }
    return {
      planId: data.plan_id,
      planRevision: data.plan_revision,
      changeSetId: data.change_set_id,
      result,
      seriesEffects: parseSeriesEffects(data.series_effects),
    };
  }

  /**
   * The owner-derived top-up. Retries are deliberately left enabled here,
   * unlike on the change set beside it: a dropped response is replayed under
   * the same idempotency key, and by then the occurrences already exist, so a
   * retry reports `unchanged` rather than writing anything a second time. The
   * one atomic mutation in this file stays the one the architecture invariant
   * in `src/architecture/server-boundary.test.ts` names, and that invariant is
   * left exactly as it was.
   */
  async materializeSeries(
    idempotencyKey: string,
    expectedPlanRevision: number,
  ): Promise<RollingPlanMaterializationReceipt> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(
      "materialize_rolling_plan_series",
      {
        p_expected_plan_revision: expectedPlanRevision,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      if (error.code === "PT409") throw new RollingPlanConflictError();
      if (error.code === "PT422") throw new RollingPlanRuleError("past-date");
      if (error.code === "PT423")
        throw new RollingPlanRuleError("daily-session-limit");
      if (error.code === "PT428") throw new RollingPlanTimezoneRequiredError();
      if (error.code === "22023") throw new RollingPlanValidationError();
      throw new RollingPlanPersistenceError();
    }
    const result = data?.result;
    if (
      !data ||
      !isInteger(data.plan_revision, 0) ||
      !isInteger(data.created_count, 0) ||
      !(data.plan_id === null || isUuid(data.plan_id)) ||
      !(data.change_set_id === null || isUuid(data.change_set_id)) ||
      (result !== "applied" && result !== "replayed" && result !== "unchanged")
    ) {
      throw new RollingPlanPersistenceError();
    }
    return {
      planId: data.plan_id,
      planRevision: data.plan_revision,
      changeSetId: data.change_set_id,
      result,
      createdCount: data.created_count,
      skipped: parseSkipped(data.skipped),
    };
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new RollingPlanAuthenticationError(error);
      }
      throw new RollingPlanAuthenticationError();
    }
  }
}

export async function createRollingPlan(): Promise<RollingPlan> {
  return new RollingPlan(
    new PostgresRollingPlanAdapter(await createServerUserClient()),
  );
}

function parseSliceReceipt(value: unknown): RollingPlanSlice {
  const receipt = readRecord(value);
  if (
    !(receipt.plan_id === null || isUuid(receipt.plan_id)) ||
    !isInteger(receipt.plan_revision, 0) ||
    !Array.isArray(receipt.sessions) ||
    !Array.isArray(receipt.recovery_dates) ||
    !receipt.recovery_dates.every(isIsoDate)
  ) {
    throw new RollingPlanPersistenceError();
  }
  return {
    planId: receipt.plan_id,
    revision: receipt.plan_revision,
    sessions: receipt.sessions.map(parseSession),
    recoveryDates: receipt.recovery_dates,
  };
}

/**
 * What one series operation did to the occurrences already on the Plan. A
 * change set that touched no series carries a null here rather than an empty
 * array, so absent and "nothing happened" stay distinguishable in the receipt.
 */
function parseSeriesEffects(value: unknown): RollingPlanSeriesEffect[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new RollingPlanPersistenceError();
  return value.map((entry) => {
    const effect = readRecord(entry);
    if (
      !isUuid(effect.seriesId) ||
      !(
        effect.operation === "edit_series" || effect.operation === "end_series"
      ) ||
      !isInteger(effect.deleted, 0) ||
      !isInteger(effect.divergedDeleted, 0) ||
      !isInteger(effect.lockedKept, 0)
    ) {
      throw new RollingPlanPersistenceError();
    }
    return {
      seriesId: effect.seriesId,
      operation: effect.operation,
      deleted: effect.deleted,
      divergedDeleted: effect.divergedDeleted,
      lockedKept: effect.lockedKept,
    };
  });
}

/** The database names its own reasons; the domain keeps its own spelling. */
const SKIP_REASONS: Record<string, RollingPlanSkippedOccurrence["reason"]> = {
  daily_session_limit: "daily-session-limit",
  change_set_limit: "change-set-limit",
};

function parseSkipped(value: unknown): RollingPlanSkippedOccurrence[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new RollingPlanPersistenceError();
  return value.map((entry) => {
    const skipped = readRecord(entry);
    const reason =
      typeof skipped.reason === "string"
        ? SKIP_REASONS[skipped.reason]
        : undefined;
    if (
      !isUuid(skipped.seriesId) ||
      !isIsoDate(skipped.occurrenceDate) ||
      reason === undefined
    ) {
      throw new RollingPlanPersistenceError();
    }
    return {
      seriesId: skipped.seriesId,
      occurrenceDate: skipped.occurrenceDate,
      reason,
    };
  });
}

function parseSession(value: unknown): RollingPlanSession {
  const session = readRecord(value);
  if (
    !isUuid(session.id) ||
    !isIsoDate(session.localDate) ||
    !isInteger(session.position, 0) ||
    typeof session.title !== "string" ||
    typeof session.sport !== "string" ||
    !(session.intent === null || typeof session.intent === "string") ||
    !(
      session.expectedDurationMinutes === null ||
      isInteger(session.expectedDurationMinutes, 1)
    ) ||
    !(session.note === null || typeof session.note === "string") ||
    typeof session.isLocked !== "boolean" ||
    !(session.status === "active" || session.status === "cancelled") ||
    !(
      session.cancelledAt === null || typeof session.cancelledAt === "string"
    ) ||
    // A one-off session carries no occurrence identity; an occurrence carries
    // both halves of it. Half of one would mean the row no longer says which
    // rule produced it, which is worse than refusing to read it.
    !(session.seriesId === null || isUuid(session.seriesId)) ||
    !(session.occurrenceDate === null || isIsoDate(session.occurrenceDate)) ||
    (session.seriesId === null) !== (session.occurrenceDate === null) ||
    typeof session.hasDiverged !== "boolean" ||
    !Array.isArray(session.activities)
  ) {
    throw new RollingPlanPersistenceError();
  }
  return {
    id: session.id,
    localDate: session.localDate,
    position: session.position,
    title: session.title,
    sport: session.sport,
    ...(session.intent === null ? {} : { intent: session.intent }),
    ...(session.expectedDurationMinutes === null
      ? {}
      : { expectedDurationMinutes: session.expectedDurationMinutes }),
    ...(session.note === null ? {} : { note: session.note }),
    isLocked: session.isLocked,
    status: session.status,
    cancelledAt: session.cancelledAt,
    seriesId: session.seriesId,
    occurrenceDate: session.occurrenceDate,
    hasDiverged: session.hasDiverged,
    activities: session.activities.map(parseActivity),
  };
}

function parseActivity(value: unknown): RollingPlanActivity {
  const activity = readRecord(value);
  if (
    !isUuid(activity.id) ||
    !(
      activity.personalActivityId === null ||
      isUuid(activity.personalActivityId)
    ) ||
    !isInteger(activity.position, 0) ||
    typeof activity.name !== "string" ||
    typeof activity.sport !== "string" ||
    !(
      activity.instructions === null ||
      typeof activity.instructions === "string"
    ) ||
    !TRAINING_MEASUREMENT_MODES.includes(
      activity.measurementMode as (typeof TRAINING_MEASUREMENT_MODES)[number],
    ) ||
    typeof activity.isLocked !== "boolean"
  ) {
    throw new RollingPlanPersistenceError();
  }
  const measurementMode =
    activity.measurementMode as RollingPlanActivity["measurementMode"];
  let target: RollingPlanActivity["target"];
  if (activity.target !== null) {
    try {
      target = parseTrainingMeasurement(measurementMode, activity.target);
    } catch {
      throw new RollingPlanPersistenceError();
    }
  }
  return {
    id: activity.id,
    ...(activity.personalActivityId === null
      ? {}
      : { personalActivityId: activity.personalActivityId }),
    position: activity.position,
    name: activity.name,
    sport: activity.sport,
    ...(activity.instructions === null
      ? {}
      : { instructions: activity.instructions }),
    measurementMode,
    ...(target === undefined ? {} : { target }),
    isLocked: activity.isLocked,
  };
}

function parseSeries(value: unknown): RollingPlanSeries {
  const series = readRecord(value);
  const activities = series.rolling_plan_series_activities;
  if (
    !isUuid(series.id) ||
    !(
      series.predecessor_series_id === null ||
      isUuid(series.predecessor_series_id)
    ) ||
    !(series.frequency === "daily" || series.frequency === "weekly") ||
    !isInteger(series.interval_count, 1) ||
    !(
      series.weekdays === null ||
      (Array.isArray(series.weekdays) &&
        series.weekdays.every((day) => isInteger(day, 0) && day <= 6))
    ) ||
    !isIsoDate(series.start_date) ||
    !(series.end_date === null || isIsoDate(series.end_date)) ||
    typeof series.title !== "string" ||
    typeof series.sport !== "string" ||
    !(series.intent === null || typeof series.intent === "string") ||
    !(
      series.expected_duration_minutes === null ||
      isInteger(series.expected_duration_minutes, 1)
    ) ||
    !(series.note === null || typeof series.note === "string") ||
    !Array.isArray(activities)
  ) {
    throw new RollingPlanPersistenceError();
  }
  if (
    (series.frequency === "daily" && series.weekdays !== null) ||
    (series.frequency === "weekly" &&
      (series.weekdays === null || series.weekdays.length === 0))
  ) {
    throw new RollingPlanPersistenceError();
  }
  return {
    id: series.id,
    predecessorSeriesId: series.predecessor_series_id,
    frequency: series.frequency,
    intervalCount: series.interval_count,
    ...(series.weekdays === null
      ? {}
      : { weekdays: [...new Set(series.weekdays)].toSorted() }),
    startDate: series.start_date,
    ...(series.end_date === null ? {} : { endDate: series.end_date }),
    title: series.title,
    sport: series.sport,
    ...(series.intent === null ? {} : { intent: series.intent }),
    ...(series.expected_duration_minutes === null
      ? {}
      : { expectedDurationMinutes: series.expected_duration_minutes }),
    ...(series.note === null ? {} : { note: series.note }),
    activities: activities
      .map(parseSeriesActivity)
      .toSorted((left, right) => left.position - right.position),
  };
}

function parseSeriesActivity(value: unknown): RollingPlanSeriesActivityInput {
  const activity = readRecord(value);
  if (
    !(
      activity.personal_activity_id === null ||
      isUuid(activity.personal_activity_id)
    ) ||
    !isInteger(activity.position, 0) ||
    typeof activity.name !== "string" ||
    typeof activity.sport !== "string" ||
    !(
      activity.instructions === null ||
      typeof activity.instructions === "string"
    ) ||
    !TRAINING_MEASUREMENT_MODES.includes(
      activity.measurement_mode as (typeof TRAINING_MEASUREMENT_MODES)[number],
    )
  ) {
    throw new RollingPlanPersistenceError();
  }
  const measurementMode =
    activity.measurement_mode as RollingPlanSeriesActivityInput["measurementMode"];
  let target: RollingPlanSeriesActivityInput["target"];
  if (activity.target !== null) {
    try {
      target = parseTrainingMeasurement(measurementMode, activity.target);
    } catch {
      throw new RollingPlanPersistenceError();
    }
  }
  return {
    ...(activity.personal_activity_id === null
      ? {}
      : { personalActivityId: activity.personal_activity_id }),
    position: activity.position,
    name: activity.name,
    sport: activity.sport,
    ...(activity.instructions === null
      ? {}
      : { instructions: activity.instructions }),
    measurementMode,
    ...(target === undefined ? {} : { target }),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RollingPlanPersistenceError();
  }
  return value as Record<string, unknown>;
}

function isInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= minimum
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
