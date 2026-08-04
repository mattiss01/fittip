import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import {
  parseExpectedRevision,
  parseGoalId,
  parseGoalInput,
  parseGoalTier,
  parseOrderedGoalIds,
  type GoalInput,
  type GoalStatus,
  type GoalTier,
} from "@/server/goals/goal-records";

const GOAL_COLUMNS =
  "id, user_id, title, desired_outcome, category, activity_areas, start_date, target_date, target_detail, target_metric_label, target_metric_value, target_metric_unit, priority_tier, status, active_rank, last_active_rank, rationale, constraints_text, archived_at, created_at, updated_at" as const;

type GoalClient = SupabaseClient<Database> | ServerUserClient;
type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type GoalOperation =
  | "pause"
  | "resume"
  | "achieve"
  | "abandon"
  | "reopen"
  | "archive"
  | "delete";

export type Goal = {
  id: string;
  title: string;
  desiredOutcome: string;
  category: string;
  activityAreas: string[];
  startDate: string;
  targetDate: string | null;
  targetDetail: string | null;
  targetMetricLabel: string | null;
  targetMetricValue: string | null;
  targetMetricUnit: string | null;
  priorityTier: GoalTier;
  status: GoalStatus;
  activeRank: number | null;
  rationale: string | null;
  constraints: string | null;
  archivedAt: string | null;
};

export type GoalCollection = { revision: number; goals: Goal[] };

export class GoalAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "GoalAuthenticationError";
  }
}

export class GoalPersistenceError extends Error {
  constructor() {
    super("The goal operation could not be completed.");
    this.name = "GoalPersistenceError";
  }
}

export class GoalConflictError extends Error {
  constructor(
    readonly reason: "stale" | "core-limit" | "archive-required" = "stale",
  ) {
    super("The goal collection changed before this save.");
    this.name = "GoalConflictError";
  }
}

export class GoalRepository {
  constructor(private readonly client: GoalClient) {}

  async list(): Promise<GoalCollection> {
    const userId = await this.getVerifiedUserId();
    const [{ data: head, error: headError }, { data, error }] =
      await Promise.all([
        this.client
          .from("goal_collections")
          .select("revision")
          .eq("user_id", userId)
          .maybeSingle(),
        this.client
          .from("goals")
          .select(GOAL_COLUMNS)
          .eq("user_id", userId)
          .order("archived_at", { nullsFirst: true })
          .order("status")
          .order("priority_tier")
          .order("active_rank"),
      ]);
    if (headError || error) throw new GoalPersistenceError();
    return { revision: head?.revision ?? 0, goals: data.map(toGoal) };
  }

  async create(input: unknown, expectedRevision: unknown) {
    return this.mutate(
      "create",
      expectedRevision,
      undefined,
      parseGoalInput(input),
    );
  }

  async edit(id: unknown, input: unknown, expectedRevision: unknown) {
    return this.mutate(
      "edit",
      expectedRevision,
      parseGoalId(id),
      parseGoalInput(input),
    );
  }

  async transition(
    operation: GoalOperation,
    id: unknown,
    expectedRevision: unknown,
    placement?: { tier: unknown; rank?: unknown },
  ) {
    const tier = placement ? parseGoalTier(placement.tier) : undefined;
    const rank =
      placement?.rank === undefined ? undefined : Number(placement.rank);
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: operation,
      p_goal_id: parseGoalId(id),
      ...(tier ? { p_priority_tier: tier } : {}),
      ...(rank === undefined ? {} : { p_target_rank: rank }),
    });
  }

  async reorder(tier: unknown, orderedIds: unknown, expectedRevision: unknown) {
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: "reorder",
      p_priority_tier: parseGoalTier(tier),
      p_ordered_goal_ids: parseOrderedGoalIds(orderedIds),
    });
  }

  private async mutate(
    operation: "create" | "edit",
    expectedRevision: unknown,
    id?: string,
    goal?: GoalInput,
  ) {
    if (!goal) throw new GoalPersistenceError();
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: operation,
      ...(id ? { p_goal_id: id } : {}),
      p_title: goal.title,
      p_desired_outcome: goal.desiredOutcome,
      p_category: goal.category,
      p_activity_areas: goal.activityAreas,
      p_start_date: goal.startDate,
      ...(goal.targetDate ? { p_target_date: goal.targetDate } : {}),
      ...(goal.targetDetail ? { p_target_detail: goal.targetDetail } : {}),
      ...(goal.targetMetricLabel
        ? { p_target_metric_label: goal.targetMetricLabel }
        : {}),
      ...(goal.targetMetricValue
        ? { p_target_metric_value: goal.targetMetricValue }
        : {}),
      ...(goal.targetMetricUnit
        ? { p_target_metric_unit: goal.targetMetricUnit }
        : {}),
      p_priority_tier: goal.priorityTier,
      ...(goal.targetRank ? { p_target_rank: goal.targetRank } : {}),
      ...(goal.rationale ? { p_rationale: goal.rationale } : {}),
      ...(goal.constraints ? { p_constraints_text: goal.constraints } : {}),
    });
  }

  private async call(
    args: Database["public"]["Functions"]["apply_goal_change"]["Args"],
  ) {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_goal_change", args)
      .retry(false);
    if (error) {
      if (error.code === "PT409") {
        const reason =
          error.message === "Three core goals are already active."
            ? "core-limit"
            : error.message === "This goal must be archived."
              ? "archive-required"
              : "stale";
        throw new GoalConflictError(reason);
      }
      throw new GoalPersistenceError();
    }
    if (!data) throw new GoalPersistenceError();
    return data;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new GoalAuthenticationError(error);
      }
      throw new GoalAuthenticationError();
    }
  }
}

export async function createGoalRepository(): Promise<GoalRepository> {
  return new GoalRepository(await createServerUserClient());
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    desiredOutcome: row.desired_outcome,
    category: row.category,
    activityAreas: row.activity_areas,
    startDate: row.start_date,
    targetDate: row.target_date,
    targetDetail: row.target_detail,
    targetMetricLabel: row.target_metric_label,
    targetMetricValue: row.target_metric_value,
    targetMetricUnit: row.target_metric_unit,
    priorityTier: row.priority_tier as GoalTier,
    status: row.status as Goal["status"],
    activeRank: row.active_rank,
    rationale: row.rationale,
    constraints: row.constraints_text,
    archivedAt: row.archived_at,
  };
}
