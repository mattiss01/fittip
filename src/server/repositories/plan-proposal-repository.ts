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
import type {
  CoachAIMemoryCandidate,
  SevenDayPlanProposal,
} from "@/server/ai/contracts";
import type { CoachAISourceReference } from "@/server/ai/context-source";
import type {
  PlanProposalDecision,
  PlanProposalItemDecision,
  PlanProposalItemKind,
  PlanProposalItemView,
} from "@/lib/plan/plan-proposal-view";
import type { PlanProposalView } from "@/server/plan-proposal/plan-proposal-records";

/**
 * The only application path to the five plan-proposal functions.
 *
 * Every write goes through a `SECURITY DEFINER` function that derives its own
 * owner from `auth.uid()`. This repository passes no owner id and could not: no
 * function accepts one. What it does own is the mapping from a Postgres error
 * code to something a screen can act on — `PT409` is a conflict the owner must
 * look at again, `PT432` is an unresolved item, `PT433` is a review that has
 * already ended, and everything else is an opaque failure that reveals nothing
 * about why.
 *
 * Reads use the owner `SELECT` policies rather than a function, because reading
 * your own proposal needs no elevated privilege.
 *
 * No call here disables retries. The finish is idempotent in the database — a
 * repeat replays the terminal decision row instead of writing the plan a second
 * time, and the change set underneath it carries its own idempotency key — so an
 * automatically retried dropped response cannot apply anything twice. The
 * allowlist in `src/architecture/server-boundary.test.ts` is unchanged by this
 * ticket, deliberately.
 */

type PlanProposalClient = SupabaseClient<Database> | ServerUserClient;

const PROPOSAL_COLUMNS = `
  id, provider_code, planning_note, content, created_at,
  plan_generation_requests!plan_proposals_request_fkey (
    requested_start_date, requested_end_date, expected_plan_revision
  ),
  plan_proposal_items (
    ordinal, kind, content_index, local_date, title, sport, intent,
    expected_duration_minutes, rationale
  ),
  plan_proposal_item_decisions ( ordinal, decision ),
  plan_proposal_decisions ( decision )
` as const;

export class PlanProposalAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "PlanProposalAuthenticationError";
  }
}

export class PlanProposalPersistenceError extends Error {
  constructor() {
    // Deliberately says nothing about the cause. A database message can carry a
    // constraint name, a column, or a value.
    super("The proposal could not be saved.");
    this.name = "PlanProposalPersistenceError";
  }
}

export type PlanProposalConflictReason =
  | "stale"
  | "already-finished"
  | "unresolved-items"
  | "not-available";

export class PlanProposalConflictError extends Error {
  constructor(readonly reason: PlanProposalConflictReason) {
    super("Your plan changed. Review the proposal again.");
    this.name = "PlanProposalConflictError";
  }
}

/**
 * A rule the plan itself refused, reported as the plan reports it.
 *
 * These come from `apply_rolling_plan_change_set` through the finish, not from
 * anything this ticket added, and they are surfaced under their own names so the
 * owner is told which rule stopped them rather than being told to reload.
 */
export type PlanProposalRuleReason =
  | "past-date"
  | "daily-session-limit"
  | "timezone-required";

export class PlanProposalRuleError extends Error {
  constructor(readonly reason: PlanProposalRuleReason) {
    super("That change is not allowed on your plan.");
    this.name = "PlanProposalRuleError";
  }
}

export type PlanGenerationClaim = {
  generationId: string;
  completionToken: string;
  /**
   * `claimed` is returned only to the caller whose insert opened the attempt,
   * and is the only state that authorizes a provider call. A replay of the same
   * key returns the stored state instead — `pending` while the original attempt
   * is still in flight, or its outcome once it has finished.
   */
  state: "claimed" | "pending" | "completed" | "failed";
  proposalId: string | null;
};

export type PlanReviewReceipt = {
  proposalId: string;
  decision: PlanProposalDecision;
  appliedCount: number;
  changeSetId: string | null;
  planRevision: number | null;
  state: "applied" | "discarded" | "replayed";
};

export class PlanProposalRepository {
  constructor(private readonly client: PlanProposalClient) {}

  /**
   * The most recent proposal, open or finished.
   *
   * Deliberately not "the open one". The finish is a Server Action that
   * revalidates the review path, so a page that asked for an open proposal
   * would answer "none" the instant the owner pressed Finish and would replace
   * their own receipt with an empty state. The surface is told the proposal's
   * terminal decision instead and renders what actually happened.
   * `plan_proposal_decisions` is one row at most, so PostgREST embeds it as an
   * object; its absence is what "still open" means.
   */
  async getLatestProposal(): Promise<PlanProposalView | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposals")
      .select(PROPOSAL_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new PlanProposalPersistenceError();
    return data ? parseProposal(data) : null;
  }

  /**
   * The roadmap version a proposal was planned under, or `null`.
   *
   * The first read of `plan_proposal_sources` anywhere in the application.
   * Lineage has been written since the table existed and never read back, so
   * this is a new access path rather than a new column: RLS already confines it
   * to the owner (`plan_proposal_sources_owner_select`) and the repeated
   * `user_id` predicate is the usual second check.
   *
   * It reads only the roadmap kind. The goal, memory and completion sources are
   * lineage for a record nobody is shown, and widening this to "all sources"
   * would be reading owner records to display nothing.
   */
  async getRoadmapSource(
    proposalId: string,
  ): Promise<{ versionId: string; versionNumber: number } | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposal_sources")
      .select("record_id, revision_number")
      .eq("user_id", userId)
      .eq("proposal_id", proposalId)
      .eq("source_kind", "roadmap_version")
      .maybeSingle();
    if (error) throw new PlanProposalPersistenceError();
    if (data === null) return null;
    return {
      versionId: data.record_id,
      // Written by `finish_plan_generation` from the version number, so a null
      // here would mean a row this application did not write.
      versionNumber: Number(data.revision_number ?? 0),
    };
  }

  async getProposal(proposalId: string): Promise<PlanProposalView | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposals")
      .select(PROPOSAL_COLUMNS)
      .eq("user_id", userId)
      .eq("id", proposalId)
      .maybeSingle();
    if (error) throw new PlanProposalPersistenceError();
    return data ? parseProposal(data) : null;
  }

  /**
   * Claim one provider attempt, durably, before anything is called.
   *
   * ADR-015's shape: a unique proposal row would prevent two proposals but not
   * two provider calls made before either insert, which is the race this exists
   * to close.
   */
  async beginGeneration(input: {
    idempotencyKey: string;
    requestFingerprint: string;
    startDate: string;
    dayCount: number;
    expectedPlanRevision: number;
    planningNote: string | null;
  }): Promise<PlanGenerationClaim> {
    const data = await this.call("begin_plan_generation", {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_start_date: input.startDate,
      p_day_count: input.dayCount,
      p_expected_plan_revision: input.expectedPlanRevision,
      ...(input.planningNote === null
        ? {}
        : { p_planning_note: input.planningNote }),
    });

    return {
      generationId: String(data.generation_id),
      completionToken: String(data.completion_token),
      state: data.state as PlanGenerationClaim["state"],
      proposalId: data.proposal_id ? String(data.proposal_id) : null,
    };
  }

  /** Persist a validated proposal with its minimized provenance. */
  async finishGenerationWithProposal(input: {
    completionToken: string;
    schemaVersion: string;
    promptVersion: string;
    providerCode: string;
    modelCode: string;
    rateCardVersion: string;
    spendReservationId: string | null;
    planningNote: string | null;
    content: SevenDayPlanProposal;
    sources: readonly CoachAISourceReference[] | undefined;
  }): Promise<string> {
    const data = await this.call("finish_plan_generation", {
      p_completion_token: input.completionToken,
      p_outcome: "proposal",
      p_schema_version: input.schemaVersion,
      p_prompt_version: input.promptVersion,
      p_provider_code: input.providerCode,
      p_model_code: input.modelCode,
      p_rate_card_version: input.rateCardVersion,
      ...(input.spendReservationId === null
        ? {}
        : { p_spend_reservation_id: input.spendReservationId }),
      ...(input.planningNote === null
        ? {}
        : { p_planning_note: input.planningNote }),
      p_content: input.content as unknown as Json,
      ...(input.sources === undefined
        ? {}
        : { p_sources: input.sources as unknown as Json }),
    });
    const proposalId = data.proposal_id;
    if (!proposalId) throw new PlanProposalPersistenceError();
    return String(proposalId);
  }

  /**
   * Close a claimed attempt that never produced a proposal.
   *
   * The code comes from a fixed enum; no provider text, prompt, or raw error
   * reaches the database.
   */
  async finishGenerationAsFailed(
    completionToken: string,
    safeFailureCode: string,
  ): Promise<void> {
    await this.call("finish_plan_generation", {
      p_completion_token: completionToken,
      p_outcome: "failed",
      p_safe_failure_code: safeFailureCode,
    });
  }

  async decideItem(
    proposalId: string,
    ordinal: number,
    decision: PlanProposalItemDecision,
  ): Promise<void> {
    await this.getVerifiedUserId();
    const { error } = await this.client.rpc("decide_plan_proposal_item", {
      p_proposal_id: proposalId,
      p_ordinal: ordinal,
      p_decision: decision,
    });
    if (error) throw toDomainError(error);
  }

  /**
   * Apply everything staged, in one transaction, or nothing.
   *
   * The plan rules that can refuse this are the plan's own, raised by
   * `apply_rolling_plan_change_set` inside the same transaction, and a refusal
   * leaves no terminal decision behind — so the review is still open and the
   * owner can act on what they were told.
   */
  async finishReview(input: {
    proposalId: string;
    expectedPlanRevision: number;
    idempotencyKey: string;
  }): Promise<PlanReviewReceipt> {
    const data = await this.call("finish_plan_proposal_review", {
      p_proposal_id: input.proposalId,
      p_expected_plan_revision: input.expectedPlanRevision,
      p_idempotency_key: input.idempotencyKey,
    });
    return parseReviewReceipt(data);
  }

  /** Close the review with no plan write, in any branch. */
  async discard(proposalId: string): Promise<PlanReviewReceipt> {
    const data = await this.call("discard_plan_proposal", {
      p_proposal_id: proposalId,
    });
    return parseReviewReceipt(data);
  }

  /**
   * Create the inferred memory candidates, in their own transaction.
   *
   * Called only after the plan proposal has committed. A conflict here rolls
   * back the candidate batch and leaves the plan proposal valid, which is
   * ADR-015's independent-decision boundary rather than an accident of
   * ordering, and the same shape the roadmap path uses.
   */
  async recordMemoryCandidates(input: {
    completionToken: string;
    expectedMemoryRevision: number;
    candidates: CoachAIMemoryCandidate[];
  }): Promise<{ collectionRevision: number; itemIds: string[] }> {
    const data = await this.call("record_plan_memory_candidates", {
      p_completion_token: input.completionToken,
      p_expected_memory_revision: input.expectedMemoryRevision,
      p_candidates: input.candidates as unknown as Json,
    });

    const itemIds = Array.isArray(data.item_ids) ? data.item_ids : [];
    return {
      collectionRevision: Number(data.collection_revision ?? 0),
      itemIds: itemIds.map(String),
    };
  }

  /**
   * How many candidates from a plan proposal are still waiting on the owner.
   *
   * Counted rather than listed, for the reason the roadmap's equivalent is:
   * the proposal surface shows a link, and the candidates themselves are
   * reviewed on the M2-02 memory surface, which owns their content. The
   * `plan-proposal:` prefix is what keeps this from counting the roadmap's.
   */
  async countOpenMemoryCandidates(): Promise<number> {
    const userId = await this.getVerifiedUserId();
    const { count, error } = await this.client
      .from("memory_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "proposed")
      .like("source_reference", "plan-proposal:%");
    if (error) throw new PlanProposalPersistenceError();
    return count ?? 0;
  }

  private async call<Name extends PlanProposalFunctionName>(
    name: Name,
    args: PlanProposalFunctionArgs<Name>,
  ): Promise<Record<string, unknown>> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(name, args as never);
    if (error) throw toDomainError(error);
    if (!data) throw new PlanProposalPersistenceError();
    return data as unknown as Record<string, unknown>;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new PlanProposalAuthenticationError(error);
      }
      throw new PlanProposalAuthenticationError();
    }
  }
}

type PlanProposalFunctionName =
  | "begin_plan_generation"
  | "finish_plan_generation"
  | "decide_plan_proposal_item"
  | "finish_plan_proposal_review"
  | "discard_plan_proposal"
  | "record_plan_memory_candidates";

type PlanProposalFunctionArgs<Name extends PlanProposalFunctionName> =
  Database["public"]["Functions"][Name]["Args"];

/**
 * The functions raise a fixed set of codes and messages, so matching them is
 * matching a constant this repository ships alongside the migration, not parsing
 * arbitrary database text. An unrecognized code is the most conservative
 * outcome: an opaque failure.
 */
function toDomainError(error: { code?: string; message?: string }): Error {
  if (error.code === "PT432") {
    return new PlanProposalConflictError("unresolved-items");
  }
  if (error.code === "PT433") {
    return new PlanProposalConflictError("already-finished");
  }
  if (error.code === "PT422") return new PlanProposalRuleError("past-date");
  if (error.code === "PT423") {
    return new PlanProposalRuleError("daily-session-limit");
  }
  if (error.code === "PT428") {
    return new PlanProposalRuleError("timezone-required");
  }
  if (error.code === "PT409") {
    const message = error.message ?? "";
    if (
      message.startsWith("That proposal is no longer available") ||
      message.startsWith("That proposed item is no longer available") ||
      message.startsWith("That coaching request")
    ) {
      return new PlanProposalConflictError("not-available");
    }
    return new PlanProposalConflictError("stale");
  }
  return new PlanProposalPersistenceError();
}

function parseReviewReceipt(data: Record<string, unknown>): PlanReviewReceipt {
  const state = data.state;
  const decision = data.decision;
  if (
    typeof data.proposal_id !== "string" ||
    (decision !== "applied" && decision !== "discarded") ||
    (state !== "applied" && state !== "discarded" && state !== "replayed")
  ) {
    throw new PlanProposalPersistenceError();
  }
  return {
    proposalId: data.proposal_id,
    decision,
    appliedCount: Number(data.applied_count ?? 0),
    changeSetId: data.change_set_id ? String(data.change_set_id) : null,
    planRevision:
      data.plan_revision === null || data.plan_revision === undefined
        ? null
        : Number(data.plan_revision),
    state,
  };
}

type ProposalRow = {
  id: string;
  provider_code: string;
  planning_note: string | null;
  content: unknown;
  created_at: string;
  plan_generation_requests: {
    requested_start_date: string;
    requested_end_date: string;
    expected_plan_revision: number;
  } | null;
  plan_proposal_items: {
    ordinal: number;
    kind: string;
    content_index: number | null;
    local_date: string;
    title: string | null;
    sport: string | null;
    intent: string | null;
    expected_duration_minutes: number | null;
    rationale: string | null;
  }[];
  plan_proposal_item_decisions: { ordinal: number; decision: string }[];
  plan_proposal_decisions: { decision: string } | null;
};

function parseProposal(row: ProposalRow): PlanProposalView {
  const decisions = new Map(
    (row.plan_proposal_item_decisions ?? []).map((entry) => [
      entry.ordinal,
      entry.decision as PlanProposalItemDecision,
    ]),
  );
  const request = row.plan_generation_requests;

  const items: PlanProposalItemView[] = (row.plan_proposal_items ?? [])
    .map((item) => ({
      ordinal: item.ordinal,
      kind: item.kind as PlanProposalItemKind,
      localDate: item.local_date,
      // An item with no decision row is Proposed. The absence is the state, so
      // there is nothing here that can disagree with the count the database
      // makes under the lock.
      decision: decisions.get(item.ordinal) ?? "proposed",
      title: item.title,
      sport: item.sport,
      intent: item.intent,
      expectedDurationMinutes: item.expected_duration_minutes,
      rationale: item.rationale,
      contentIndex: item.content_index,
    }))
    .sort((left, right) => left.ordinal - right.ordinal);

  return {
    id: row.id,
    providerCode: row.provider_code,
    planningNote: row.planning_note,
    content: row.content as SevenDayPlanProposal,
    startDate: request?.requested_start_date ?? "",
    endDate: request?.requested_end_date ?? "",
    composedAtPlanRevision: request?.expected_plan_revision ?? 0,
    items,
    decision:
      (row.plan_proposal_decisions?.decision as PlanProposalDecision) ?? null,
    createdAt: row.created_at,
  };
}

export async function createPlanProposalRepository(): Promise<PlanProposalRepository> {
  return new PlanProposalRepository(await createServerUserClient());
}
