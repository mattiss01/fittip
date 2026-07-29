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
  parseManualPlanInput,
  parsePersonalActivityInput,
  TrainingRecordValidationError,
  type ManualPlanInput,
  type PersonalActivityInput,
} from "@/server/training/training-records";
import { assertPastPlanContentIsImmutable } from "@/server/training/past-plan-protection";

const PERSONAL_ACTIVITY_COLUMNS =
  "id, user_id, name, sport, description, measurement_mode, default_measurement, archived_at, created_at, updated_at" as const;
const PLAN_HEAD_COLUMNS =
  "user_id, current_version_id, revision, updated_at" as const;
const PLAN_VERSION_COLUMNS =
  "id, user_id, version_number, parent_version_id, parent_version_number, day_count, start_date, end_date, timezone_name, source_kind, accepted_at, created_at" as const;
const PLANNED_SESSION_COLUMNS =
  "id, user_id, plan_version_id, local_date, position, title, sport, intent, expected_duration_minutes, note, is_locked, created_at" as const;
const PLANNED_ACTIVITY_COLUMNS =
  "id, user_id, planned_session_id, personal_activity_id, position, name, sport, instructions, measurement_mode, target, is_locked, created_at" as const;

type TrainingRecordClient = SupabaseClient<Database> | ServerUserClient;
type PlanVersionRow =
  Database["public"]["Tables"]["detailed_plan_versions"]["Row"];
type PlanHeadRow = Database["public"]["Tables"]["detailed_plan_heads"]["Row"];
type PersonalActivityRow =
  Database["public"]["Tables"]["personal_activities"]["Row"];
type PlannedSessionRow =
  Database["public"]["Tables"]["planned_sessions"]["Row"];
type PlannedActivityRow =
  Database["public"]["Tables"]["planned_activities"]["Row"];

export type DetailedPlanVersion = {
  id: string;
  userId: string;
  versionNumber: number;
  parentVersionId: string | null;
  dayCount: number;
  startDate: string;
  endDate: string;
  timezoneName: string;
  sourceKind: "manual";
  acceptedAt: string;
  createdAt: string;
};

export type DetailedPlanHead = {
  userId: string;
  currentVersionId: string;
  revision: number;
  updatedAt: string;
};

export type PersonalActivity = {
  id: string;
  userId: string;
  name: string;
  sport: string;
  description: string | null;
  measurementMode: string;
  defaultMeasurement: Json | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CurrentManualPlan = {
  head: DetailedPlanHead;
  version: DetailedPlanVersion;
  plan: ManualPlanInput;
};

export type PlannedActivitySnapshot = {
  id: string;
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: string;
  target: Json | null;
};

export type PlannedSessionRecord = {
  id: string;
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  activities: PlannedActivitySnapshot[];
};

export type PlanVersionSnapshot = {
  version: DetailedPlanVersion;
  sessions: PlannedSessionRecord[];
};

export type CurrentPlanSnapshot = PlanVersionSnapshot & {
  head: DetailedPlanHead;
};

export class TrainingRecordAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "TrainingRecordAuthenticationError";
  }
}

export class TrainingRecordPersistenceError extends Error {
  constructor() {
    super("The training record operation could not be completed.");
    this.name = "TrainingRecordPersistenceError";
  }
}

export class TrainingPlanConflictError extends Error {
  constructor() {
    super("The training plan changed before this save.");
    this.name = "TrainingPlanConflictError";
  }
}

export class ReferencedPersonalActivityError extends Error {
  constructor() {
    super(
      "A referenced personal activity must be archived instead of deleted.",
    );
    this.name = "ReferencedPersonalActivityError";
  }
}

export class TrainingRecordRepository {
  constructor(
    private readonly client: TrainingRecordClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCurrentPlanHead(): Promise<DetailedPlanHead | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("detailed_plan_heads")
      .select(PLAN_HEAD_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new TrainingRecordPersistenceError();
    }

    return data ? toPlanHead(data) : null;
  }

  async getCurrentManualPlan(): Promise<CurrentManualPlan | null> {
    const userId = await this.getVerifiedUserId();
    const { data: headRow, error: headError } = await this.client
      .from("detailed_plan_heads")
      .select(PLAN_HEAD_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (headError) {
      throw new TrainingRecordPersistenceError();
    }
    if (!headRow) {
      return null;
    }

    const { data: versionRow, error: versionError } = await this.client
      .from("detailed_plan_versions")
      .select(PLAN_VERSION_COLUMNS)
      .eq("id", headRow.current_version_id)
      .eq("user_id", userId)
      .single();

    if (versionError || !versionRow) {
      throw new TrainingRecordPersistenceError();
    }

    const { data: sessionRows, error: sessionsError } = await this.client
      .from("planned_sessions")
      .select(PLANNED_SESSION_COLUMNS)
      .eq("plan_version_id", versionRow.id)
      .eq("user_id", userId)
      .order("local_date")
      .order("position");

    if (sessionsError) {
      throw new TrainingRecordPersistenceError();
    }

    const sessionIds = sessionRows.map(({ id }) => id);
    let activityRows: PlannedActivityRow[] = [];
    if (sessionIds.length > 0) {
      const { data, error } = await this.client
        .from("planned_activities")
        .select(PLANNED_ACTIVITY_COLUMNS)
        .eq("user_id", userId)
        .in("planned_session_id", sessionIds)
        .order("position");

      if (error) {
        throw new TrainingRecordPersistenceError();
      }
      activityRows = data;
    }

    return {
      head: toPlanHead(headRow),
      version: toPlanVersion(versionRow),
      plan: parseManualPlanInput(
        toManualPlanInput(versionRow, sessionRows, activityRows),
      ),
    };
  }

  async getCurrentPlanSnapshot(): Promise<CurrentPlanSnapshot | null> {
    const userId = await this.getVerifiedUserId();
    const { data: headRow, error: headError } = await this.client
      .from("detailed_plan_heads")
      .select(PLAN_HEAD_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (headError) throw new TrainingRecordPersistenceError();
    if (!headRow) return null;

    const snapshot = await this.getPlanVersionSnapshotForUser(
      userId,
      headRow.current_version_id,
    );
    if (!snapshot) throw new TrainingRecordPersistenceError();

    return { head: toPlanHead(headRow), ...snapshot };
  }

  async listPlanVersions(): Promise<DetailedPlanVersion[]> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("detailed_plan_versions")
      .select(PLAN_VERSION_COLUMNS)
      .eq("user_id", userId)
      .order("version_number", { ascending: false });

    if (error) throw new TrainingRecordPersistenceError();
    return data.map(toPlanVersion);
  }

  async getPlanVersionSnapshot(
    planVersionId: string,
  ): Promise<PlanVersionSnapshot | null> {
    assertUuid(planVersionId);
    const userId = await this.getVerifiedUserId();
    return this.getPlanVersionSnapshotForUser(userId, planVersionId);
  }

  async saveManualPlan(
    input: unknown,
    expectedRevision: number,
  ): Promise<DetailedPlanVersion> {
    const plan = parseManualPlanInput(input);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new TrainingRecordValidationError();
    }

    const current = await this.getCurrentManualPlan();
    assertPastPlanContentIsImmutable(current?.plan ?? null, plan, this.now());
    const { data, error } = await this.client
      .rpc("save_manual_plan_version", {
        p_expected_revision: expectedRevision,
        p_day_count: plan.dayCount,
        p_start_date: plan.startDate,
        p_timezone_name: plan.timezoneName,
        p_sessions: toPlanJson(plan),
      })
      .retry(false);

    if (error) {
      if (error.code === "PT409") {
        throw new TrainingPlanConflictError();
      }
      throw new TrainingRecordPersistenceError();
    }

    if (!data) {
      throw new TrainingRecordPersistenceError();
    }

    return toPlanVersion(data);
  }

  async listActivePersonalActivities(): Promise<PersonalActivity[]> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("personal_activities")
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("name");

    if (error) {
      throw new TrainingRecordPersistenceError();
    }

    return data.map(toPersonalActivity);
  }

  async createPersonalActivity(input: unknown): Promise<PersonalActivity> {
    const activity = parsePersonalActivityInput(input);
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("personal_activities")
      .insert(toPersonalActivityInsert(userId, activity))
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .single();

    if (error || !data) {
      throw new TrainingRecordPersistenceError();
    }

    return toPersonalActivity(data);
  }

  async updatePersonalActivity(
    id: string,
    input: unknown,
  ): Promise<PersonalActivity> {
    assertUuid(id);
    const activity = parsePersonalActivityInput(input);
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("personal_activities")
      .update({
        name: activity.name,
        sport: activity.sport,
        description: activity.description ?? null,
        measurement_mode: activity.measurementMode,
        default_measurement: activity.defaultMeasurement ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .single();

    if (error || !data) {
      throw new TrainingRecordPersistenceError();
    }

    return toPersonalActivity(data);
  }

  async archivePersonalActivity(id: string): Promise<PersonalActivity> {
    assertUuid(id);
    const userId = await this.getVerifiedUserId();
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("personal_activities")
      .update({ archived_at: now, updated_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .select(PERSONAL_ACTIVITY_COLUMNS)
      .single();

    if (error || !data) {
      throw new TrainingRecordPersistenceError();
    }

    return toPersonalActivity(data);
  }

  async deleteUnreferencedPersonalActivity(id: string): Promise<void> {
    assertUuid(id);
    const userId = await this.getVerifiedUserId();
    const { error } = await this.client
      .from("personal_activities")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error?.code === "23503") {
      throw new ReferencedPersonalActivityError();
    }
    if (error) {
      throw new TrainingRecordPersistenceError();
    }
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new TrainingRecordAuthenticationError(error);
      }
      throw new TrainingRecordAuthenticationError();
    }
  }

  private async getPlanVersionSnapshotForUser(
    userId: string,
    planVersionId: string,
  ): Promise<PlanVersionSnapshot | null> {
    const { data: versionRow, error: versionError } = await this.client
      .from("detailed_plan_versions")
      .select(PLAN_VERSION_COLUMNS)
      .eq("id", planVersionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (versionError) throw new TrainingRecordPersistenceError();
    if (!versionRow) return null;

    const { data: sessionRows, error: sessionsError } = await this.client
      .from("planned_sessions")
      .select(PLANNED_SESSION_COLUMNS)
      .eq("plan_version_id", planVersionId)
      .eq("user_id", userId)
      .order("local_date")
      .order("position");
    if (sessionsError) throw new TrainingRecordPersistenceError();

    const sessionIds = sessionRows.map(({ id }) => id);
    let activityRows: PlannedActivityRow[] = [];
    if (sessionIds.length > 0) {
      const { data, error } = await this.client
        .from("planned_activities")
        .select(PLANNED_ACTIVITY_COLUMNS)
        .eq("user_id", userId)
        .in("planned_session_id", sessionIds)
        .order("position");
      if (error) throw new TrainingRecordPersistenceError();
      activityRows = data;
    }

    return {
      version: toPlanVersion(versionRow),
      sessions: toPlannedSessionRecords(sessionRows, activityRows),
    };
  }
}

export async function createTrainingRecordRepository(): Promise<TrainingRecordRepository> {
  return new TrainingRecordRepository(await createServerUserClient());
}

function toPlanJson(plan: ManualPlanInput): Json {
  return plan.sessions.map((session) => ({
    local_date: session.localDate,
    position: session.position,
    title: session.title,
    sport: session.sport,
    ...(session.intent === undefined ? {} : { intent: session.intent }),
    ...(session.expectedDurationMinutes === undefined
      ? {}
      : { expected_duration_minutes: session.expectedDurationMinutes }),
    ...(session.note === undefined ? {} : { note: session.note }),
    is_locked: session.isLocked,
    activities: session.activities.map((activity) => ({
      ...(activity.personalActivityId === undefined
        ? {}
        : { personal_activity_id: activity.personalActivityId }),
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
      ...(activity.instructions === undefined
        ? {}
        : { instructions: activity.instructions }),
      measurement_mode: activity.measurementMode,
      ...(activity.target === undefined ? {} : { target: activity.target }),
      is_locked: activity.isLocked,
    })),
  }));
}

function toPersonalActivityInsert(
  userId: string,
  activity: PersonalActivityInput,
): Database["public"]["Tables"]["personal_activities"]["Insert"] {
  return {
    user_id: userId,
    name: activity.name,
    sport: activity.sport,
    description: activity.description ?? null,
    measurement_mode: activity.measurementMode,
    default_measurement: activity.defaultMeasurement ?? null,
  };
}

function toPlanVersion(row: PlanVersionRow): DetailedPlanVersion {
  return {
    id: row.id,
    userId: row.user_id,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id,
    dayCount: row.day_count,
    startDate: row.start_date,
    endDate: row.end_date,
    timezoneName: row.timezone_name,
    sourceKind: "manual",
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

function toPlanHead(row: PlanHeadRow): DetailedPlanHead {
  return {
    userId: row.user_id,
    currentVersionId: row.current_version_id,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function toPersonalActivity(row: PersonalActivityRow): PersonalActivity {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sport: row.sport,
    description: row.description,
    measurementMode: row.measurement_mode,
    defaultMeasurement: row.default_measurement,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toManualPlanInput(
  version: PlanVersionRow,
  sessions: PlannedSessionRow[],
  activities: PlannedActivityRow[],
): unknown {
  const activitiesBySession = new Map<string, PlannedActivityRow[]>();
  for (const activity of activities) {
    const sessionActivities =
      activitiesBySession.get(activity.planned_session_id) ?? [];
    sessionActivities.push(activity);
    activitiesBySession.set(activity.planned_session_id, sessionActivities);
  }

  return {
    dayCount: version.day_count,
    startDate: version.start_date,
    timezoneName: version.timezone_name,
    sessions: sessions.map((session) => ({
      localDate: session.local_date,
      position: session.position,
      title: session.title,
      sport: session.sport,
      ...(session.intent === null ? {} : { intent: session.intent }),
      ...(session.expected_duration_minutes === null
        ? {}
        : { expectedDurationMinutes: session.expected_duration_minutes }),
      ...(session.note === null ? {} : { note: session.note }),
      isLocked: session.is_locked,
      activities: (activitiesBySession.get(session.id) ?? []).map(
        (activity) => ({
          ...(activity.personal_activity_id === null
            ? {}
            : { personalActivityId: activity.personal_activity_id }),
          position: activity.position,
          name: activity.name,
          sport: activity.sport,
          ...(activity.instructions === null
            ? {}
            : { instructions: activity.instructions }),
          measurementMode: activity.measurement_mode,
          ...(activity.target === null ? {} : { target: activity.target }),
          isLocked: activity.is_locked,
        }),
      ),
    })),
  };
}

function toPlannedSessionRecords(
  sessions: PlannedSessionRow[],
  activities: PlannedActivityRow[],
): PlannedSessionRecord[] {
  const activitiesBySession = new Map<string, PlannedActivityRow[]>();
  for (const activity of activities) {
    const sessionActivities =
      activitiesBySession.get(activity.planned_session_id) ?? [];
    sessionActivities.push(activity);
    activitiesBySession.set(activity.planned_session_id, sessionActivities);
  }

  return sessions.map((session) => ({
    id: session.id,
    localDate: session.local_date,
    position: session.position,
    title: session.title,
    sport: session.sport,
    intent: session.intent,
    expectedDurationMinutes: session.expected_duration_minutes,
    note: session.note,
    activities: (activitiesBySession.get(session.id) ?? []).map((activity) => ({
      id: activity.id,
      name: activity.name,
      sport: activity.sport,
      instructions: activity.instructions,
      measurementMode: activity.measurement_mode,
      target: activity.target,
    })),
  }));
}

function assertUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new TrainingRecordValidationError();
  }
}
