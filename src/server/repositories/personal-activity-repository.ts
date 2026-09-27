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
  PersonalActivityConflictError,
  PersonalActivityLibrary,
  PersonalActivityNameTakenError,
  PersonalActivityPersistenceError,
  PersonalActivityValidationError,
  type PersonalActivity,
  type PersonalActivityAdapter,
  type PersonalActivityChange,
  type PersonalActivityContent,
} from "@/server/personal-activities/personal-activities";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

type PersonalActivityClient = SupabaseClient<Database> | ServerUserClient;

const PERSONAL_ACTIVITY_COLUMNS = `
  id, name, sport, description, measurement_mode, default_measurement,
  updated_at
` as const;

export class PersonalActivityAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "PersonalActivityAuthenticationError";
  }
}

/**
 * Postgres adapter at the library seam. It never accepts an owner id.
 *
 * Each write is one row, so it is a plain statement under the table's owner
 * policies rather than an RPC: there is no second row whose agreement it has
 * to keep. Nothing else is written, and no session, series, saved entry or log
 * that copied a definition is read or touched — they hold their own values.
 */
export class PostgresPersonalActivityAdapter
  implements PersonalActivityAdapter
{
  constructor(private readonly client: PersonalActivityClient) {}

  async list(): Promise<PersonalActivity[]> {
    const userId = await this.getVerifiedUserId();
    // RLS confines this already; the predicate is repeated because RLS is the
    // backstop rather than the only check.
    const { data, error } = await this.client
      .from("personal_activities")
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new PersonalActivityPersistenceError();
    return (data ?? []).map(parsePersonalActivity);
  }

  async applyChange(change: PersonalActivityChange): Promise<PersonalActivity> {
    const userId = await this.getVerifiedUserId();
    // The application's clock rather than the database's, because PostgREST
    // has no `now()` to send. It only has to move: the value is compared for
    // equality by the next write and never ordered against another row.
    const now = new Date().toISOString();

    if (change.operation === "create") {
      const { data, error } = await this.client
        .from("personal_activities")
        .insert({ user_id: userId, ...toColumns(change.activity) })
        .select(PERSONAL_ACTIVITY_COLUMNS)
        .single();
      if (error) throw mapWriteError(error.code);
      return parsePersonalActivity(data);
    }

    const { data, error } = await this.client
      .from("personal_activities")
      .update(
        change.operation === "edit"
          ? { ...toColumns(change.activity), updated_at: now }
          : { archived_at: now, updated_at: now },
      )
      .eq("user_id", userId)
      .eq("id", change.personalActivityId)
      .eq("updated_at", change.expectedUpdatedAt)
      .is("archived_at", null)
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .maybeSingle();
    if (error) throw mapWriteError(error.code);
    // No row means it was edited, archived, or is not this owner's. The three
    // are not told apart, so none of them says anything about another owner.
    if (!data) throw new PersonalActivityConflictError();
    return parsePersonalActivity(data);
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new PersonalActivityAuthenticationError(error);
      }
      throw new PersonalActivityAuthenticationError();
    }
  }
}

export async function createPersonalActivityLibrary(): Promise<PersonalActivityLibrary> {
  return new PersonalActivityLibrary(
    new PostgresPersonalActivityAdapter(await createServerUserClient()),
  );
}

function toColumns(activity: PersonalActivityContent) {
  return {
    name: activity.name,
    sport: activity.sport,
    description: activity.instructions ?? null,
    measurement_mode: activity.measurementMode,
    default_measurement: (activity.target ?? null) as Json,
  };
}

/**
 * `23505` can only be `personal_activities_active_name_key`: the table's other
 * unique keys are on a generated id. A check constraint the parser should
 * already have caught is still invalid.
 */
function mapWriteError(code: string | undefined): Error {
  if (code === "23505") return new PersonalActivityNameTakenError();
  if (code === "23514" || code === "22023")
    return new PersonalActivityValidationError();
  return new PersonalActivityPersistenceError();
}

function parsePersonalActivity(value: unknown): PersonalActivity {
  const activity = readRecord(value);
  if (
    !isUuid(activity.id) ||
    typeof activity.name !== "string" ||
    typeof activity.sport !== "string" ||
    !(
      activity.description === null || typeof activity.description === "string"
    ) ||
    !TRAINING_MEASUREMENT_MODES.includes(
      activity.measurement_mode as (typeof TRAINING_MEASUREMENT_MODES)[number],
    ) ||
    typeof activity.updated_at !== "string"
  ) {
    throw new PersonalActivityPersistenceError();
  }
  const measurementMode =
    activity.measurement_mode as PersonalActivity["measurementMode"];
  let target: PersonalActivity["target"];
  if (activity.default_measurement !== null) {
    try {
      target = parseTrainingMeasurement(
        measurementMode,
        activity.default_measurement,
      );
    } catch {
      throw new PersonalActivityPersistenceError();
    }
  }
  return {
    id: activity.id,
    name: activity.name,
    sport: activity.sport,
    ...(activity.description === null
      ? {}
      : { instructions: activity.description }),
    measurementMode,
    ...(target === undefined ? {} : { target }),
    updatedAt: activity.updated_at,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PersonalActivityPersistenceError();
  }
  return value as Record<string, unknown>;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
