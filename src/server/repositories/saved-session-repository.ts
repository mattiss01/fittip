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
  SavedSessionConflictError,
  SavedSessionLibrary,
  SavedSessionPersistenceError,
  SavedSessionValidationError,
  type SavedSession,
  type SavedSessionActivity,
  type SavedSessionAdapter,
  type SavedSessionChange,
  type SavedSessionReceipt,
} from "@/server/saved-sessions/saved-sessions";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

type SavedSessionClient = SupabaseClient<Database> | ServerUserClient;

const SAVED_SESSION_COLUMNS = `
  id, name, title, sport, intent, expected_duration_minutes, note, revision,
  updated_at,
  saved_session_activities (
    personal_activity_id, position, name, sport, instructions,
    measurement_mode, target
  )
` as const;

export class SavedSessionAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "SavedSessionAuthenticationError";
  }
}

/** Postgres adapter at the library seam. It never accepts an owner id. */
export class PostgresSavedSessionAdapter implements SavedSessionAdapter {
  constructor(private readonly client: SavedSessionClient) {}

  async list(): Promise<SavedSession[]> {
    const userId = await this.getVerifiedUserId();
    // RLS confines this already; the predicate is repeated because RLS is the
    // backstop rather than the only check.
    const { data, error } = await this.client
      .from("saved_sessions")
      .select(SAVED_SESSION_COLUMNS)
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new SavedSessionPersistenceError();
    return (data ?? []).map(parseSavedSession);
  }

  async get(savedSessionId: string): Promise<SavedSession | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("saved_sessions")
      .select(SAVED_SESSION_COLUMNS)
      .eq("user_id", userId)
      .eq("id", savedSessionId)
      .maybeSingle();
    if (error) throw new SavedSessionPersistenceError();
    return data ? parseSavedSession(data) : null;
  }

  async applyChange(change: SavedSessionChange): Promise<SavedSessionReceipt> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_saved_session_change", toArguments(change))
      .retry(false);
    if (error) {
      if (error.code === "PT409") throw new SavedSessionConflictError();
      if (error.code === "22023") throw new SavedSessionValidationError();
      throw new SavedSessionPersistenceError();
    }
    const result = data?.result;
    if (
      !data ||
      data.saved_session_id === null ||
      data.revision === null ||
      (result !== "created" && result !== "updated" && result !== "deleted")
    ) {
      throw new SavedSessionPersistenceError();
    }
    return {
      savedSessionId: data.saved_session_id,
      revision: data.revision,
      result,
    };
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new SavedSessionAuthenticationError(error);
      }
      throw new SavedSessionAuthenticationError();
    }
  }
}

export async function createSavedSessionLibrary(): Promise<SavedSessionLibrary> {
  return new SavedSessionLibrary(
    new PostgresSavedSessionAdapter(await createServerUserClient()),
  );
}

/**
 * Every write reaches the same owner-derived function. An edit carries no
 * activity list, because nothing can edit a saved session's activities yet;
 * sending one is refused by the function rather than silently dropped.
 */
function toArguments(change: SavedSessionChange) {
  if (change.operation === "delete") {
    return {
      p_operation: "delete",
      p_saved_session_id: change.savedSessionId,
      p_expected_revision: change.expectedRevision,
    };
  }
  const { session } = change;
  const content = {
    p_name: session.name,
    p_title: session.title,
    p_sport: session.sport,
    p_intent: session.intent ?? undefined,
    p_expected_duration_minutes: session.expectedDurationMinutes ?? undefined,
    p_note: session.note ?? undefined,
  };
  if (change.operation === "edit") {
    return {
      p_operation: "edit",
      p_saved_session_id: change.savedSessionId,
      p_expected_revision: change.expectedRevision,
      ...content,
    };
  }
  return {
    p_operation: "create",
    ...content,
    p_activities: change.session.activities as unknown as Json,
  };
}

function parseSavedSession(value: unknown): SavedSession {
  const saved = readRecord(value);
  const activities = saved.saved_session_activities;
  if (
    !isUuid(saved.id) ||
    typeof saved.name !== "string" ||
    typeof saved.title !== "string" ||
    typeof saved.sport !== "string" ||
    !(saved.intent === null || typeof saved.intent === "string") ||
    !(
      saved.expected_duration_minutes === null ||
      isInteger(saved.expected_duration_minutes, 1)
    ) ||
    !(saved.note === null || typeof saved.note === "string") ||
    !isInteger(saved.revision, 0) ||
    typeof saved.updated_at !== "string" ||
    !Array.isArray(activities)
  ) {
    throw new SavedSessionPersistenceError();
  }
  return {
    id: saved.id,
    name: saved.name,
    title: saved.title,
    sport: saved.sport,
    ...(saved.intent === null ? {} : { intent: saved.intent }),
    ...(saved.expected_duration_minutes === null
      ? {}
      : { expectedDurationMinutes: saved.expected_duration_minutes }),
    ...(saved.note === null ? {} : { note: saved.note }),
    revision: saved.revision,
    updatedAt: saved.updated_at,
    activities: activities
      .map(parseSavedActivity)
      .toSorted((left, right) => left.position - right.position),
  };
}

function parseSavedActivity(value: unknown): SavedSessionActivity {
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
    throw new SavedSessionPersistenceError();
  }
  const measurementMode =
    activity.measurement_mode as SavedSessionActivity["measurementMode"];
  let target: SavedSessionActivity["target"];
  if (activity.target !== null) {
    try {
      target = parseTrainingMeasurement(measurementMode, activity.target);
    } catch {
      throw new SavedSessionPersistenceError();
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
    throw new SavedSessionPersistenceError();
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
