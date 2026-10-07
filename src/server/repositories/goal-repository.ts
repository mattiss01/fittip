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
  "id, user_id, title, desired_outcome, sports, target_date, priority_tier, status, active_rank, last_active_rank, created_at, updated_at" as const;

type GoalClient = SupabaseClient<Database> | ServerUserClient;
// Without `achieved_at`, which `listStatusChanges` reads on its own.
type GoalRow = Omit<
  Database["public"]["Tables"]["goals"]["Row"],
  "achieved_at"
>;
type GoalOperation =
  | "pause"
  | "resume"
  | "achieve"
  | "abandon"
  | "reopen"
  | "delete";

export type Goal = {
  id: string;
  title: string;
  desiredOutcome: string;
  sports: string[];
  targetDate: string | null;
  priorityTier: GoalTier;
  status: GoalStatus;
  activeRank: number | null;
};

export type GoalCollection = { revision: number; goals: Goal[] };

/** A goal that is not active: the status it has, and when it entered it. */
export type GoalStatusChange = {
  goalId: string;
  status: string;
  changedAt: string;
};

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
  constructor(readonly reason: "stale" | "core-limit" = "stale") {
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
          .order("status")
          .order("priority_tier")
          .order("active_rank"),
      ]);
    if (headError || error) throw new GoalPersistenceError();
    return { revision: head?.revision ?? 0, goals: data.map(toGoal) };
  }

  /**
   * When each goal that is not active entered the status it has, for the
   * Goals page, which says "Achieved on ...".
   *
   * An achieved goal has its own `achieved_at`, which `apply_goal_change` sets
   * on `achieve` and clears on `reopen` and nothing else writes. A paused or
   * abandoned goal has none, so it answers with `updated_at`, which an edit of
   * such a goal would move.
   *
   * Kept out of `list()`, whose goals also go to the coach's context.
   */
  async listStatusChanges(): Promise<GoalStatusChange[]> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("goals")
      .select("id, status, achieved_at, updated_at")
      .eq("user_id", userId)
      .neq("status", "active");
    if (error) throw new GoalPersistenceError();
    return data.map((row) => ({
      goalId: row.id,
      status: row.status,
      changedAt: row.achieved_at ?? row.updated_at,
    }));
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
      p_sports: goal.sports,
      ...(goal.targetDate ? { p_target_date: goal.targetDate } : {}),
      p_priority_tier: goal.priorityTier,
      ...(goal.targetRank ? { p_target_rank: goal.targetRank } : {}),
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
    sports: row.sports,
    targetDate: row.target_date,
    priorityTier: row.priority_tier as GoalTier,
    status: row.status as Goal["status"],
    activeRank: row.active_rank,
  };
}
