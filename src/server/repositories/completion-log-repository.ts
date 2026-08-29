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
  CompletionConflictError,
  CompletionLog,
  CompletionPersistenceError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
  COMPLETION_FEELINGS,
  COMPLETION_STATUSES,
  type Completion,
  type CompletionActivity,
  type CompletionChange,
  type CompletionLogAdapter,
  type CompletionPlannedActivity,
  type CompletionPlannedSnapshot,
  type CompletionReceipt,
  type ParsedCompletionWindow,
} from "@/server/completions/completion-log";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

type CompletionClient = SupabaseClient<Database> | ServerUserClient;

const COMPLETION_COLUMNS = `
  id, plan_session_id, status, actual_local_date, timezone_name,
  actual_started_at, duration_minutes, perceived_effort, feeling, note,
  replacement_description, pain_reported, illness_reported, injury_reported,
  severe_fatigue_reported, planned_snapshot, revision, updated_at,
  completion_activities (
    personal_activity_id, position, name, sport, instructions,
    measurement_mode, actual_measurement
  )
` as const;

export class CompletionAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "CompletionAuthenticationError";
  }
}

/** Postgres adapter at the completion seam. It never accepts an owner id. */
export class PostgresCompletionLogAdapter implements CompletionLogAdapter {
  constructor(private readonly client: CompletionClient) {}

  async list({
    startDate,
    endDate,
  }: ParsedCompletionWindow): Promise<Completion[]> {
    const userId = await this.getVerifiedUserId();
    // RLS confines this already; the predicate is repeated because RLS is the
    // backstop rather than the only check.
    const { data, error } = await this.client
      .from("completions")
      .select(COMPLETION_COLUMNS)
      .eq("user_id", userId)
      .gte("actual_local_date", startDate)
      .lte("actual_local_date", endDate)
      .order("actual_local_date", { ascending: false })
      .order("id", { ascending: true });
    if (error) throw new CompletionPersistenceError();
    return (data ?? []).map(parseCompletion);
  }

  async get(completionId: string): Promise<Completion | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("completions")
      .select(COMPLETION_COLUMNS)
      .eq("user_id", userId)
      .eq("id", completionId)
      .maybeSingle();
    if (error) throw new CompletionPersistenceError();
    return data ? parseCompletion(data) : null;
  }

  /**
   * The one atomic completion mutation. Retries are disabled because a create
   * is not idempotent and an edit answers to a revision: replaying a dropped
   * response would either write a second record or reapply a change the owner
   * was told to review.
   */
  async applyChange(change: CompletionChange): Promise<CompletionReceipt> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_completion_change", toArguments(change))
      .retry(false);
    if (error) {
      if (error.code === "PT409") throw new CompletionConflictError();
      if (error.code === "PT428") throw new CompletionTimezoneRequiredError();
      if (error.code === "22023") throw new CompletionValidationError();
      throw new CompletionPersistenceError();
    }
    const result = data?.result;
    if (
      !data ||
      data.completion_id === null ||
      data.revision === null ||
      (result !== "created" && result !== "updated")
    ) {
      throw new CompletionPersistenceError();
    }
    return {
      completionId: data.completion_id,
      revision: data.revision,
      result,
    };
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new CompletionAuthenticationError(error);
      }
      throw new CompletionAuthenticationError();
    }
  }
}

export async function createCompletionLog(): Promise<CompletionLog> {
  return new CompletionLog(
    new PostgresCompletionLogAdapter(await createServerUserClient()),
  );
}

/**
 * Both writes reach the same owner-derived function. A create carries the
 * planned link and the activity list; an edit carries neither, because the
 * planned link is immutable and no activity editor exists yet. The planned
 * snapshot is never sent: the function captures it from the plan row itself,
 * so no caller can compose or forge one.
 */
function toArguments(change: CompletionChange) {
  if (change.operation === "edit") {
    return {
      p_operation: "edit",
      p_completion_id: change.completionId,
      p_expected_revision: change.expectedRevision,
      p_completion: change.completion as unknown as Json,
    };
  }
  return {
    p_operation: "create",
    p_completion: change.completion as unknown as Json,
  };
}

function parseCompletion(value: unknown): Completion {
  const completion = readRecord(value);
  const activities = completion.completion_activities;
  if (
    !isUuid(completion.id) ||
    !(
      completion.plan_session_id === null || isUuid(completion.plan_session_id)
    ) ||
    !isChoice(completion.status, COMPLETION_STATUSES) ||
    !isIsoDate(completion.actual_local_date) ||
    typeof completion.timezone_name !== "string" ||
    !(
      completion.actual_started_at === null ||
      typeof completion.actual_started_at === "string"
    ) ||
    !(
      completion.duration_minutes === null ||
      isInteger(completion.duration_minutes, 0)
    ) ||
    !(
      completion.perceived_effort === null ||
      isInteger(completion.perceived_effort, 1)
    ) ||
    !(
      completion.feeling === null ||
      isChoice(completion.feeling, COMPLETION_FEELINGS)
    ) ||
    !(completion.note === null || typeof completion.note === "string") ||
    !(
      completion.replacement_description === null ||
      typeof completion.replacement_description === "string"
    ) ||
    typeof completion.pain_reported !== "boolean" ||
    typeof completion.illness_reported !== "boolean" ||
    typeof completion.injury_reported !== "boolean" ||
    typeof completion.severe_fatigue_reported !== "boolean" ||
    !isInteger(completion.revision, 0) ||
    typeof completion.updated_at !== "string" ||
    // The link and the snapshot are two halves of one fact. Half of one would
    // mean the row no longer says what it was measured against, which is worse
    // than refusing to read it.
    (completion.plan_session_id === null) !==
      (completion.planned_snapshot === null) ||
    !Array.isArray(activities)
  ) {
    throw new CompletionPersistenceError();
  }
  return {
    id: completion.id,
    planSessionId: completion.plan_session_id,
    status: completion.status,
    actualLocalDate: completion.actual_local_date,
    timezoneName: completion.timezone_name,
    ...(completion.actual_started_at === null
      ? {}
      : {
          actualStartedAt: new Date(completion.actual_started_at).toISOString(),
        }),
    ...(completion.duration_minutes === null
      ? {}
      : { durationMinutes: completion.duration_minutes }),
    ...(completion.perceived_effort === null
      ? {}
      : { perceivedEffort: completion.perceived_effort }),
    ...(completion.feeling === null ? {} : { feeling: completion.feeling }),
    ...(completion.note === null ? {} : { note: completion.note }),
    ...(completion.replacement_description === null
      ? {}
      : { replacementDescription: completion.replacement_description }),
    painReported: completion.pain_reported,
    illnessReported: completion.illness_reported,
    injuryReported: completion.injury_reported,
    severeFatigueReported: completion.severe_fatigue_reported,
    plannedSnapshot:
      completion.planned_snapshot === null
        ? null
        : parsePlannedSnapshot(completion.planned_snapshot),
    revision: completion.revision,
    updatedAt: completion.updated_at,
    activities: activities
      .map(parseCompletionActivity)
      .toSorted((left, right) => left.position - right.position),
  };
}

/**
 * The stored snapshot is whatever `rolling_plan_session_state` wrote, which is
 * the same shape a `rolling_plan_change_entries.after_state` carries. This
 * projects the part a consumer needs; the row itself keeps every key, and
 * nothing here ever writes it back.
 */
function parsePlannedSnapshot(value: unknown): CompletionPlannedSnapshot {
  const snapshot = readRecord(value);
  if (
    !isIsoDate(snapshot.localDate) ||
    !isInteger(snapshot.position, 0) ||
    typeof snapshot.title !== "string" ||
    typeof snapshot.sport !== "string" ||
    !(snapshot.intent === null || typeof snapshot.intent === "string") ||
    !(
      snapshot.expectedDurationMinutes === null ||
      isInteger(snapshot.expectedDurationMinutes, 1)
    ) ||
    !(snapshot.note === null || typeof snapshot.note === "string") ||
    typeof snapshot.isLocked !== "boolean" ||
    !(snapshot.status === "active" || snapshot.status === "cancelled") ||
    !(snapshot.seriesId === null || isUuid(snapshot.seriesId)) ||
    !(snapshot.occurrenceDate === null || isIsoDate(snapshot.occurrenceDate)) ||
    !Array.isArray(snapshot.activities)
  ) {
    throw new CompletionPersistenceError();
  }
  return {
    localDate: snapshot.localDate,
    position: snapshot.position,
    title: snapshot.title,
    sport: snapshot.sport,
    ...(snapshot.intent === null ? {} : { intent: snapshot.intent }),
    ...(snapshot.expectedDurationMinutes === null
      ? {}
      : { expectedDurationMinutes: snapshot.expectedDurationMinutes }),
    ...(snapshot.note === null ? {} : { note: snapshot.note }),
    isLocked: snapshot.isLocked,
    status: snapshot.status,
    seriesId: snapshot.seriesId,
    occurrenceDate: snapshot.occurrenceDate,
    activities: snapshot.activities
      .map(parsePlannedActivity)
      .toSorted((left, right) => left.position - right.position),
  };
}

function parsePlannedActivity(value: unknown): CompletionPlannedActivity {
  const activity = readMeasuredActivity(value);
  return {
    ...activity.identity,
    ...(activity.measurement === undefined
      ? {}
      : { target: activity.measurement }),
    measurementMode: activity.measurementMode,
  };
}

function parseCompletionActivity(value: unknown): CompletionActivity {
  const activity = readMeasuredActivity(value, "actual_measurement");
  return {
    ...activity.identity,
    ...(activity.measurement === undefined
      ? {}
      : { actualMeasurement: activity.measurement }),
    measurementMode: activity.measurementMode,
  };
}

/**
 * A planned activity and a completed one differ only in which key holds the
 * measurement and whether the row is snake or camel cased, so the shared part
 * is read once.
 */
function readMeasuredActivity(value: unknown, measurementKey?: string) {
  const activity = readRecord(value);
  const stored = measurementKey !== undefined;
  const personalActivityId = stored
    ? activity.personal_activity_id
    : activity.personalActivityId;
  const measurementMode = stored
    ? activity.measurement_mode
    : activity.measurementMode;
  const measurement = stored ? activity[measurementKey] : activity.target;
  if (
    !(personalActivityId === null || isUuid(personalActivityId)) ||
    !isInteger(activity.position, 0) ||
    typeof activity.name !== "string" ||
    typeof activity.sport !== "string" ||
    !(
      activity.instructions === null ||
      typeof activity.instructions === "string"
    ) ||
    !isChoice(measurementMode, TRAINING_MEASUREMENT_MODES)
  ) {
    throw new CompletionPersistenceError();
  }
  let parsed;
  if (measurement !== null && measurement !== undefined) {
    try {
      parsed = parseTrainingMeasurement(measurementMode, measurement);
    } catch {
      throw new CompletionPersistenceError();
    }
  }
  return {
    identity: {
      ...(personalActivityId === null ? {} : { personalActivityId }),
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
      ...(activity.instructions === null
        ? {}
        : { instructions: activity.instructions }),
    },
    measurementMode,
    measurement: parsed,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CompletionPersistenceError();
  }
  return value as Record<string, unknown>;
}

function isInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= minimum
  );
}

function isChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): value is T[number] {
  return typeof value === "string" && choices.includes(value);
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
