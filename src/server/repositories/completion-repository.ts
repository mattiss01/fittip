import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type CompletedActivity,
  type CompletionHistory,
  type CompletionInput,
  type CompletionRevision,
  type PlannedSessionSnapshot,
} from "@/features/completions/completion-types";
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
  CompletionValidationError,
  parseCompletionInput,
} from "@/server/completions/completion-records";

const COMPLETION_COLUMNS =
  "id, user_id, completion_group_id, revision_number, previous_completion_id, planned_session_id, actual_local_date, actual_started_at, timezone_name, duration_minutes, status, perceived_effort, feeling, note, replacement_description, pain_reported, illness_reported, injury_reported, severe_fatigue_reported, correction_reason, created_at" as const;
const COMPLETED_ACTIVITY_COLUMNS =
  "id, completed_session_id, planned_activity_id, personal_activity_id, position, name, sport, instructions, measurement_mode, actual_measurement" as const;
const PLANNED_SESSION_COLUMNS =
  "id, local_date, title, sport, intent, expected_duration_minutes" as const;
const PLANNED_ACTIVITY_COLUMNS =
  "id, planned_session_id, position, name, sport, instructions, measurement_mode" as const;

type CompletionClient = SupabaseClient<Database> | ServerUserClient;
type CompletionRow = Pick<
  Database["public"]["Tables"]["completed_sessions"]["Row"],
  | "id"
  | "user_id"
  | "completion_group_id"
  | "revision_number"
  | "previous_completion_id"
  | "planned_session_id"
  | "actual_local_date"
  | "actual_started_at"
  | "timezone_name"
  | "duration_minutes"
  | "status"
  | "perceived_effort"
  | "feeling"
  | "note"
  | "replacement_description"
  | "pain_reported"
  | "illness_reported"
  | "injury_reported"
  | "severe_fatigue_reported"
  | "correction_reason"
  | "created_at"
>;
type CompletedActivityRow = Pick<
  Database["public"]["Tables"]["completed_activities"]["Row"],
  | "id"
  | "completed_session_id"
  | "planned_activity_id"
  | "personal_activity_id"
  | "position"
  | "name"
  | "sport"
  | "instructions"
  | "measurement_mode"
  | "actual_measurement"
>;

export class CompletionAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "CompletionAuthenticationError";
  }
}

export class CompletionPersistenceError extends Error {
  constructor() {
    super("The completion operation could not be completed.");
    this.name = "CompletionPersistenceError";
  }
}

export class CompletionConflictError extends Error {
  constructor() {
    super("This completion changed before the save.");
    this.name = "CompletionConflictError";
  }
}

export class CompletionRepository {
  constructor(private readonly client: CompletionClient) {}

  async ensureAuthenticated(): Promise<void> {
    await this.getVerifiedUserId();
  }

  async save(input: unknown): Promise<CompletionRevision> {
    const completion = parseCompletionInput(input);
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("save_training_completion", toRpcInput(completion))
      .retry(false);

    if (error?.code === "PT409") throw new CompletionConflictError();
    if (error || !data) throw new CompletionPersistenceError();

    const history = await this.getCompletionHistory(data.completion_group_id);
    if (!history || history.current.id !== data.id) {
      throw new CompletionPersistenceError();
    }
    return history.current;
  }

  async getCompletionHistory(
    completionGroupId: string,
  ): Promise<CompletionHistory | null> {
    assertUuid(completionGroupId);
    const userId = await this.getVerifiedUserId();
    const { data: sessions, error: sessionError } = await this.client
      .from("completed_sessions")
      .select(COMPLETION_COLUMNS)
      .eq("user_id", userId)
      .eq("completion_group_id", completionGroupId)
      .order("revision_number", { ascending: false });

    if (sessionError) throw new CompletionPersistenceError();
    if (sessions.length === 0) return null;

    const ids = sessions.map(({ id }) => id);
    const { data: activities, error: activityError } = await this.client
      .from("completed_activities")
      .select(COMPLETED_ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .in("completed_session_id", ids)
      .order("position");
    if (activityError) throw new CompletionPersistenceError();

    const revisions = sessions.map((session) =>
      toCompletionRevision(
        session,
        activities.filter(
          (activity) => activity.completed_session_id === session.id,
        ),
      ),
    );
    return { current: revisions[0], revisions };
  }

  async getPlannedSessionSnapshot(
    plannedSessionId: string,
  ): Promise<PlannedSessionSnapshot | null> {
    assertUuid(plannedSessionId);
    const userId = await this.getVerifiedUserId();
    const { data: session, error: sessionError } = await this.client
      .from("planned_sessions")
      .select(PLANNED_SESSION_COLUMNS)
      .eq("user_id", userId)
      .eq("id", plannedSessionId)
      .maybeSingle();
    if (sessionError) throw new CompletionPersistenceError();
    if (!session) return null;

    const { data: activities, error: activityError } = await this.client
      .from("planned_activities")
      .select(PLANNED_ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .eq("planned_session_id", plannedSessionId)
      .order("position");
    if (activityError) throw new CompletionPersistenceError();

    return {
      id: session.id,
      localDate: session.local_date,
      title: session.title,
      sport: session.sport,
      intent: session.intent,
      expectedDurationMinutes: session.expected_duration_minutes,
      activities: activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        sport: activity.sport,
        instructions: activity.instructions,
        measurementMode:
          activity.measurement_mode as PlannedSessionSnapshot["activities"][number]["measurementMode"],
      })),
    };
  }

  private async getVerifiedUserId(): Promise<string> {
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

export async function createCompletionRepository() {
  return new CompletionRepository(await createServerUserClient());
}

function toRpcInput(input: CompletionInput) {
  return {
    p_idempotency_key: input.idempotencyKey,
    p_completion_group_id: input.completionGroupId ?? null,
    p_expected_revision: input.expectedRevision,
    p_planned_session_id: input.plannedSessionId ?? null,
    p_actual_local_date: input.actualLocalDate,
    p_actual_started_at: input.actualStartedAt ?? null,
    p_timezone_name: input.timezoneName,
    p_duration_minutes: input.durationMinutes ?? null,
    p_status: input.status,
    p_perceived_effort: input.perceivedEffort ?? null,
    p_feeling: input.feeling ?? null,
    p_note: input.note ?? null,
    p_replacement_description: input.replacementDescription ?? null,
    p_pain_reported: input.painReported,
    p_illness_reported: input.illnessReported,
    p_injury_reported: input.injuryReported,
    p_severe_fatigue_reported: input.severeFatigueReported,
    p_correction_reason: input.correctionReason ?? null,
    p_activities: input.activities.map((activity) => ({
      planned_activity_id: activity.plannedActivityId ?? null,
      personal_activity_id: activity.personalActivityId ?? null,
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
      instructions: activity.instructions ?? null,
      measurement_mode: activity.measurementMode,
      actual_measurement: activity.actualMeasurement ?? null,
    })) as Json,
  };
}

function toCompletionRevision(
  row: CompletionRow,
  activities: CompletedActivityRow[],
): CompletionRevision {
  return {
    id: row.id,
    userId: row.user_id,
    completionGroupId: row.completion_group_id,
    revisionNumber: row.revision_number,
    previousCompletionId: row.previous_completion_id,
    plannedSessionId: row.planned_session_id ?? undefined,
    actualLocalDate: row.actual_local_date,
    actualStartedAt: row.actual_started_at ?? undefined,
    timezoneName: row.timezone_name,
    durationMinutes: row.duration_minutes ?? undefined,
    status: row.status as CompletionRevision["status"],
    perceivedEffort: row.perceived_effort ?? undefined,
    feeling: (row.feeling as CompletionRevision["feeling"]) ?? undefined,
    note: row.note ?? undefined,
    replacementDescription: row.replacement_description ?? undefined,
    painReported: row.pain_reported,
    illnessReported: row.illness_reported,
    injuryReported: row.injury_reported,
    severeFatigueReported: row.severe_fatigue_reported,
    correctionReason: row.correction_reason ?? undefined,
    createdAt: row.created_at,
    activities: activities.map(toCompletedActivity),
  };
}

function toCompletedActivity(row: CompletedActivityRow): CompletedActivity {
  return {
    id: row.id,
    completedSessionId: row.completed_session_id,
    plannedActivityId: row.planned_activity_id ?? undefined,
    personalActivityId: row.personal_activity_id ?? undefined,
    position: row.position,
    name: row.name,
    sport: row.sport,
    instructions: row.instructions ?? undefined,
    measurementMode:
      row.measurement_mode as CompletedActivity["measurementMode"],
    actualMeasurement: row.actual_measurement ?? undefined,
  };
}

function assertUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new CompletionValidationError();
  }
}
