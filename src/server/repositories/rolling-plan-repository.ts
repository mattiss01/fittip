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
  RollingPlanValidationError,
  type ParsedPlanSlice,
  type RollingPlanActivity,
  type RollingPlanAdapter,
  type RollingPlanChangeReceipt,
  type RollingPlanChangeSet,
  type RollingPlanSession,
} from "@/server/rolling-plan/rolling-plan";

const SESSION_COLUMNS =
  "id, local_date, position, title, sport, intent, expected_duration_minutes, note, is_locked, status, cancelled_at" as const;
const ACTIVITY_COLUMNS =
  "id, session_id, personal_activity_id, position, name, sport, instructions, measurement_mode, target, is_locked" as const;

type RollingPlanClient = SupabaseClient<Database> | ServerUserClient;
type SessionRow = Pick<
  Database["public"]["Tables"]["rolling_plan_sessions"]["Row"],
  | "id"
  | "local_date"
  | "position"
  | "title"
  | "sport"
  | "intent"
  | "expected_duration_minutes"
  | "note"
  | "is_locked"
  | "status"
  | "cancelled_at"
>;
type ActivityRow = Pick<
  Database["public"]["Tables"]["rolling_plan_activities"]["Row"],
  | "id"
  | "session_id"
  | "personal_activity_id"
  | "position"
  | "name"
  | "sport"
  | "instructions"
  | "measurement_mode"
  | "target"
  | "is_locked"
>;

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
    const userId = await this.getVerifiedUserId();
    const [
      { data: plan, error: planError },
      { data: sessions, error: sessionsError },
    ] = await Promise.all([
      this.client
        .from("rolling_plans")
        .select("id, revision")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("rolling_plan_sessions")
        .select(SESSION_COLUMNS)
        .eq("user_id", userId)
        .gte("local_date", startDate)
        .lte("local_date", endDate)
        .order("local_date")
        .order("position")
        .order("id"),
    ]);
    if (planError || sessionsError) throw new RollingPlanPersistenceError();

    const sessionIds = sessions.map((session) => session.id);
    let activities: ActivityRow[] = [];
    if (sessionIds.length > 0) {
      const { data, error } = await this.client
        .from("rolling_plan_activities")
        .select(ACTIVITY_COLUMNS)
        .eq("user_id", userId)
        .in("session_id", sessionIds)
        .order("position")
        .order("id");
      if (error) throw new RollingPlanPersistenceError();
      activities = data;
    }

    const activitiesBySession = new Map<string, RollingPlanActivity[]>();
    for (const row of activities) {
      const activity = toActivity(row);
      const bucket = activitiesBySession.get(row.session_id);
      if (bucket) bucket.push(activity);
      else activitiesBySession.set(row.session_id, [activity]);
    }
    return {
      planId: plan?.id ?? null,
      revision: plan?.revision ?? 0,
      sessions: sessions.map((session) =>
        toSession(session, activitiesBySession.get(session.id) ?? []),
      ),
    };
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
      if (error.code === "PT409") throw new RollingPlanConflictError();
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

function toSession(
  row: SessionRow,
  activities: RollingPlanActivity[],
): RollingPlanSession {
  return {
    id: row.id,
    localDate: row.local_date,
    position: row.position,
    title: row.title,
    sport: row.sport,
    ...(row.intent === null ? {} : { intent: row.intent }),
    ...(row.expected_duration_minutes === null
      ? {}
      : { expectedDurationMinutes: row.expected_duration_minutes }),
    ...(row.note === null ? {} : { note: row.note }),
    isLocked: row.is_locked,
    status: row.status as RollingPlanSession["status"],
    cancelledAt: row.cancelled_at,
    activities,
  };
}

function toActivity(row: ActivityRow): RollingPlanActivity {
  return {
    id: row.id,
    ...(row.personal_activity_id === null
      ? {}
      : { personalActivityId: row.personal_activity_id }),
    position: row.position,
    name: row.name,
    sport: row.sport,
    ...(row.instructions === null ? {} : { instructions: row.instructions }),
    measurementMode:
      row.measurement_mode as RollingPlanActivity["measurementMode"],
    ...(row.target === null
      ? {}
      : { target: row.target as RollingPlanActivity["target"] }),
    isLocked: row.is_locked,
  };
}
