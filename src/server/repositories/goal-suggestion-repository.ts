import "server-only";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import type { CoachAIGoalSuggestionRecord } from "@/server/ai/context";
import type { CoachAIGoalSuggestion } from "@/server/ai/contracts";
import { MemoryCandidateBatchError } from "@/server/proposal-logging/memory-candidate-batch";

/** A goal the coach suggested, still waiting on the owner (ADR-034). */
export type OpenGoalSuggestion = {
  id: string;
  /** Where it came from, read from its source reference. */
  source: "plan" | "roadmap";
  proposalId: string | null;
  title: string;
  desiredOutcome: string;
  sports: string[];
  targetDate: string | null;
};

export type OpenGoalSuggestions = {
  /** The goal collection's revision, which Accept must name. */
  goalRevision: number;
  suggestions: OpenGoalSuggestion[];
};

export class GoalSuggestionAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "GoalSuggestionAuthenticationError";
  }
}

export class GoalSuggestionPersistenceError extends Error {
  constructor() {
    super("The goal suggestion could not be read or decided.");
    this.name = "GoalSuggestionPersistenceError";
  }
}

/**
 * Why a decision was refused, in the owner's terms: the suggestion is no
 * longer open, three core goals are already active, or the goals changed.
 */
export class GoalSuggestionConflictError extends Error {
  constructor(readonly reason: "closed" | "core-limit" | "stale") {
    super("The goal suggestion could not be decided as asked.");
    this.name = "GoalSuggestionConflictError";
  }
}

/**
 * The coach's goal suggestions (ADR-034). Recorded after a proposal commits,
 * listed for the reviews and the Goals page, and decided through
 * `decide_goal_suggestion`, which creates an accepted goal with
 * `apply_goal_change`. Every read repeats the owner predicate.
 */
export class GoalSuggestions {
  constructor(private readonly client: ServerUserClient) {}

  /** Records one, against the proposal its completion token names. */
  async record(
    source: "plan" | "roadmap",
    completionToken: string,
    suggestion: CoachAIGoalSuggestion,
  ): Promise<string> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc("record_goal_suggestion", {
      p_source: source,
      p_completion_token: completionToken,
      p_suggestion: suggestion,
    });
    if (error) throw new MemoryCandidateBatchError(error.code);
    if (typeof data !== "string") throw new GoalSuggestionPersistenceError();
    return data;
  }

  /** The open ones, oldest first, with the goal revision Accept must name. */
  async listOpen(): Promise<OpenGoalSuggestions> {
    const userId = await this.getVerifiedUserId();
    const [{ data: head, error: headError }, { data, error }] =
      await Promise.all([
        this.client
          .from("goal_collections")
          .select("revision")
          .eq("user_id", userId)
          .maybeSingle(),
        this.client
          .from("goal_suggestions")
          .select(
            "id, title, desired_outcome, sports, target_date, source_reference",
          )
          .eq("user_id", userId)
          .eq("status", "proposed")
          .order("created_at", { ascending: true }),
      ]);
    if (headError || error) throw new GoalSuggestionPersistenceError();
    return {
      goalRevision: head?.revision ?? 0,
      suggestions: data.map((row) => ({
        id: row.id,
        source: row.source_reference.startsWith("roadmap-")
          ? "roadmap"
          : "plan",
        proposalId: row.source_reference.split(":")[1] ?? null,
        title: row.title,
        desiredOutcome: row.desired_outcome,
        sports: row.sports,
        targetDate: row.target_date,
      })),
    };
  }

  /**
   * ADR-035. The coach's "don't repeat" list: the open ones, and those
   * rejected on or after `since`. Titles and dates only; assembly applies the
   * window again and keeps the newest ten.
   */
  async listForCoach(since: string): Promise<CoachAIGoalSuggestionRecord[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      throw new GoalSuggestionPersistenceError();
    }
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("goal_suggestions")
      .select("title, status, created_at, decided_at")
      .eq("user_id", userId)
      .or(`status.eq.proposed,and(status.eq.rejected,decided_at.gte.${since})`)
      // Newest decision first, open ones before any, as assembly orders.
      .order("decided_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new GoalSuggestionPersistenceError();
    return data.flatMap((row) =>
      row.status === "proposed" || row.status === "rejected"
        ? [
            {
              title: row.title,
              status: row.status,
              createdAt: row.created_at,
              decidedAt: row.decided_at,
            },
          ]
        : [],
    );
  }

  /** Accept as Core or Supporting, or Reject. */
  async decide(input: {
    suggestionId: string;
    decision: "accept" | "reject";
    priorityTier: "core" | "supporting" | null;
    expectedGoalRevision: number;
  }): Promise<void> {
    await this.getVerifiedUserId();
    const { error } = await this.client.rpc("decide_goal_suggestion", {
      p_suggestion_id: input.suggestionId,
      p_decision: input.decision,
      ...(input.decision === "accept"
        ? {
            p_priority_tier: input.priorityTier ?? undefined,
            p_expected_goal_revision: input.expectedGoalRevision,
          }
        : {}),
    });
    if (!error) return;
    if (error.code === "PT409") {
      throw new GoalSuggestionConflictError(
        error.message === "Three core goals are already active."
          ? "core-limit"
          : error.message === "That suggestion is no longer open."
            ? "closed"
            : "stale",
      );
    }
    throw new GoalSuggestionPersistenceError();
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new GoalSuggestionAuthenticationError(error);
      }
      throw new GoalSuggestionAuthenticationError();
    }
  }
}

export async function createGoalSuggestions(): Promise<GoalSuggestions> {
  return new GoalSuggestions(await createServerUserClient());
}
