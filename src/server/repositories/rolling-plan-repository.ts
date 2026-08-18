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
  type RollingPlanSession,
  type RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

type RollingPlanClient = SupabaseClient<Database> | ServerUserClient;

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
