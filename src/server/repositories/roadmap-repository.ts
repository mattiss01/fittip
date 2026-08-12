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
  RoadmapMemoryCandidate,
  RoadmapProposal,
} from "@/server/ai/contracts";
import type { CoachAISourceReference } from "@/server/ai/context-source";
import type {
  RoadmapDecision,
  RoadmapProposalOrigin,
  RoadmapProposalView,
  RoadmapVersionView,
} from "@/server/roadmap/roadmap-records";

/**
 * The only application path to ADR-015's five functions.
 *
 * Every write goes through a `SECURITY DEFINER` function that derives its own
 * owner from `auth.uid()`. This repository passes no owner id and could not: no
 * function accepts one. What it does own is the mapping from a Postgres error
 * code to something a screen can act on — `PT409` is a conflict the owner must
 * review, `PT429` is the regeneration ceiling, and everything else is an
 * opaque failure that reveals nothing about why.
 *
 * Reads use the owner `SELECT` policy rather than a function, because reading
 * your own roadmap needs no elevated privilege.
 */

type RoadmapClient = SupabaseClient<Database> | ServerUserClient;

const PROPOSAL_COLUMNS =
  "id, origin, source_proposal_id, planning_note, regeneration_feedback, content, created_at, generation_request_id" as const;
const VERSION_COLUMNS = "id, version_number, content, accepted_at" as const;

export class RoadmapAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "RoadmapAuthenticationError";
  }
}

export class RoadmapPersistenceError extends Error {
  constructor() {
    // Deliberately says nothing about the cause. A database message can carry a
    // constraint name, a column, or a value.
    super("The roadmap could not be saved.");
    this.name = "RoadmapPersistenceError";
  }
}

/**
 * Something changed under the owner and they must look again.
 *
 * `reason` distinguishes the cases a screen genuinely renders differently: a
 * stale head, a source that moved, an already-decided proposal, and the
 * regeneration ceiling. It is derived from the error code and the function's
 * own fixed messages, never from arbitrary database text.
 */
export type RoadmapConflictReason =
  | "stale"
  | "already-decided"
  | "sources-changed"
  | "regeneration-cap"
  | "not-available";

export class RoadmapConflictError extends Error {
  constructor(readonly reason: RoadmapConflictReason) {
    super("Your roadmap changed. Review it again.");
    this.name = "RoadmapConflictError";
  }
}

export type RoadmapGenerationClaim = {
  generationId: string;
  completionToken: string;
  /**
   * `claimed` is returned only to the caller whose insert opened the attempt,
   * and is the only state that authorizes a provider call. A replay of the same
   * key returns the stored state instead — `pending` while the original attempt
   * is still in flight, or its outcome once it has finished.
   */
  state: "claimed" | "pending" | "completed" | "failed";
  regenerationNumber: number;
  proposalId: string | null;
};

export type RoadmapAcceptance = {
  proposalId: string;
  versionId: string;
  headRevision: number;
  result: "accepted" | "replayed";
};

export class RoadmapRepository {
  constructor(private readonly client: RoadmapClient) {}

  async getHead(): Promise<{
    revision: number;
    currentVersionId: string | null;
  }> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("roadmap_heads")
      .select("revision, current_version_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new RoadmapPersistenceError();
    return {
      revision: data?.revision ?? 0,
      currentVersionId: data?.current_version_id ?? null,
    };
  }

  /** Accepted history, newest first. The current version is the first entry. */
  async listVersions(): Promise<RoadmapVersionView[]> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("roadmap_versions")
      .select(VERSION_COLUMNS)
      .eq("user_id", userId)
      .order("version_number", { ascending: false });
    if (error) throw new RoadmapPersistenceError();
    return data.map((row) => ({
      id: row.id,
      versionNumber: Number(row.version_number),
      content: row.content as unknown as RoadmapProposal,
      acceptedAt: row.accepted_at,
    }));
  }

  /**
   * The two proposals the review surface turns on, from one read.
   *
   * `open` is the proposal awaiting a decision. A decided proposal is history:
   * it stays readable, but it is not what the surface opens on. Ordering by
   * creation descending means an edit supersedes the proposal it came from
   * without either being rewritten.
   *
   * `declinedPredecessor` is the newest proposal when the owner has just
   * declined it, and it is the only proposal a regeneration may carry:
   * `begin_roadmap_generation` refuses a predecessor that is not owned,
   * rejected, and on the same horizon. It is read here because declining is
   * exactly what stops a proposal being `open` — without this read the screen
   * that offers **Regenerate proposal** would have no predecessor to send, and
   * decision 4's "sends only the immediately previous proposal" would be lost
   * at the moment it becomes possible.
   */
  async getReviewProposals(): Promise<{
    open: RoadmapProposalView | null;
    declinedPredecessor: RoadmapProposalView | null;
  }> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("roadmap_proposals")
      .select(
        `${PROPOSAL_COLUMNS}, roadmap_proposal_decisions(decision), roadmap_generation_requests(requested_start_date, requested_end_date, regeneration_number)`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new RoadmapPersistenceError();

    const proposals = data.map(toProposalView);
    const newest = proposals[0] ?? null;

    // An edit supersedes the proposal it came from without deciding it, so a
    // source that has produced an edit is history rather than something still
    // awaiting a decision. Without this, accepting an edit hands the owner
    // their own superseded draft back as if it were open.
    const superseded = new Set(
      proposals
        .map((proposal) => proposal.sourceProposalId)
        .filter((id): id is string => id !== null),
    );

    return {
      open:
        proposals.find(
          (proposal) =>
            proposal.decision === null && !superseded.has(proposal.id),
        ) ?? null,
      declinedPredecessor:
        newest && newest.decision === "rejected" ? newest : null,
    };
  }

  /** One proposal by id, decided or not, for the decline and edit paths. */
  async getProposal(proposalId: string): Promise<RoadmapProposalView | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("roadmap_proposals")
      .select(
        `${PROPOSAL_COLUMNS}, roadmap_proposal_decisions(decision), roadmap_generation_requests(requested_start_date, requested_end_date, regeneration_number)`,
      )
      .eq("user_id", userId)
      .eq("id", proposalId)
      .maybeSingle();
    if (error) throw new RoadmapPersistenceError();
    return data ? toProposalView(data) : null;
  }

  /**
   * How many candidates from a roadmap planning note the owner has not decided.
   *
   * Counted rather than listed: the roadmap detail shows a link, and the
   * candidates themselves are reviewed on the accepted M2-02 surface, which
   * owns their content.
   */
  async countOpenMemoryCandidates(): Promise<number> {
    const userId = await this.getVerifiedUserId();
    const { count, error } = await this.client
      .from("memory_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "proposed")
      .like("source_reference", "roadmap-proposal:%");
    if (error) throw new RoadmapPersistenceError();
    return count ?? 0;
  }

  /**
   * Claim one paid attempt before the provider is called.
   *
   * The claim is durable and the provider call is not inside it. A unique
   * proposal row would prevent two proposals but not two provider calls made
   * before either insert, which is the race this exists to close.
   */
  async beginGeneration(input: {
    idempotencyKey: string;
    requestFingerprint: string;
    startDate: string;
    endDate: string;
    expectedHeadRevision: number;
    planningNote: string | null;
    previousProposalId: string | null;
    regenerationFeedback: string | null;
  }): Promise<RoadmapGenerationClaim> {
    const data = await this.call("begin_roadmap_generation", {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_expected_head_revision: input.expectedHeadRevision,
      ...(input.planningNote === null
        ? {}
        : { p_planning_note: input.planningNote }),
      ...(input.previousProposalId === null
        ? {}
        : { p_previous_proposal_id: input.previousProposalId }),
      ...(input.regenerationFeedback === null
        ? {}
        : { p_regeneration_feedback: input.regenerationFeedback }),
    });

    return {
      generationId: String(data.generation_id),
      completionToken: String(data.completion_token),
      state: data.state as RoadmapGenerationClaim["state"],
      regenerationNumber: Number(data.regeneration_number ?? 0),
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
    regenerationFeedback: string | null;
    content: RoadmapProposal;
    sources: CoachAISourceReference[];
  }): Promise<string> {
    const data = await this.call("finish_roadmap_generation", {
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
      ...(input.regenerationFeedback === null
        ? {}
        : { p_regeneration_feedback: input.regenerationFeedback }),
      p_content: input.content as unknown as Json,
      p_sources: input.sources as unknown as Json,
    });

    if (!data.proposal_id) throw new RoadmapPersistenceError();
    return String(data.proposal_id);
  }

  /**
   * Record that an attempt ended without a proposal.
   *
   * The claim is closed with a bounded code and nothing else. Leaving it
   * pending would be honest about the uncertainty but would also strand the
   * owner's next attempt behind the same key.
   */
  async finishGenerationAsFailed(
    completionToken: string,
    safeFailureCode: string,
  ): Promise<void> {
    await this.call("finish_roadmap_generation", {
      p_completion_token: completionToken,
      p_outcome: "failed",
      p_safe_failure_code: safeFailureCode,
    });
  }

  /**
   * Create the inferred memory candidates, in their own transaction.
   *
   * Called only after the roadmap proposal has committed. A conflict here rolls
   * back the candidate batch and leaves the roadmap valid, which is the
   * approved independent-decision boundary rather than an accident of ordering.
   */
  async recordMemoryCandidates(input: {
    completionToken: string;
    expectedMemoryRevision: number;
    candidates: RoadmapMemoryCandidate[];
  }): Promise<{ collectionRevision: number; itemIds: string[] }> {
    const data = await this.call("record_roadmap_memory_candidates", {
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

  /** Decision 4: an edit creates a new proposal; it never rewrites its source. */
  async editProposal(
    proposalId: string,
    content: RoadmapProposal,
  ): Promise<string> {
    const data = await this.call("apply_roadmap_proposal_change", {
      p_operation: "edit",
      p_proposal_id: proposalId,
      p_content: content as unknown as Json,
    });
    if (!data.proposal_id) throw new RoadmapPersistenceError();
    return String(data.proposal_id);
  }

  /**
   * Decline. The proposal stays in history and never becomes current, and the
   * decision is what makes it eligible as a regeneration's predecessor.
   */
  async declineProposal(proposalId: string): Promise<void> {
    await this.call("apply_roadmap_proposal_change", {
      p_operation: "reject",
      p_proposal_id: proposalId,
    });
  }

  /** Accept, in one transaction that rechecks ownership, sources, and the head. */
  async acceptProposal(
    proposalId: string,
    expectedHeadRevision: number,
  ): Promise<RoadmapAcceptance> {
    const data = await this.call("accept_roadmap_proposal", {
      p_proposal_id: proposalId,
      p_expected_head_revision: expectedHeadRevision,
    });

    return {
      proposalId: String(data.proposal_id),
      versionId: String(data.version_id),
      headRevision: Number(data.head_revision ?? 0),
      result: data.result as RoadmapAcceptance["result"],
    };
  }

  /**
   * One place that runs an ADR-015 function and maps its failure.
   *
   * These five deliberately keep the client's default transport retry, unlike
   * the plan, completion, goal, memory and onboarding RPCs, which switch it off
   * because an automatic second attempt could re-run a change the owner was
   * told to review.
   *
   * The roadmap functions are replay-safe by construction instead. The same
   * idempotency key and fingerprint return the existing claim; the same
   * completion token returns the existing proposal; the same candidate batch
   * returns the existing items; and replaying a decline, an identical edit, or
   * an acceptance returns the existing receipt. pgTAP proves each of those.
   *
   * Given that, a second attempt after an uncertain transport failure is the
   * behaviour we want: it resolves the uncertainty, where refusing to reattempt
   * would report a conflict for a call that had actually succeeded. The
   * allowlist in `src/architecture/server-boundary.test.ts` is therefore
   * unchanged by this ticket.
   */
  private async call<Name extends RoadmapFunctionName>(
    name: Name,
    args: RoadmapFunctionArgs<Name>,
  ): Promise<Record<string, unknown>> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(name, args as never);

    if (error) {
      if (error.code === "PT429") {
        throw new RoadmapConflictError("regeneration-cap");
      }
      if (error.code === "PT409") {
        throw new RoadmapConflictError(conflictReason(error.message));
      }
      throw new RoadmapPersistenceError();
    }
    if (!data) throw new RoadmapPersistenceError();
    return data as unknown as Record<string, unknown>;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new RoadmapAuthenticationError(error);
      }
      throw new RoadmapAuthenticationError();
    }
  }
}

type RoadmapFunctionName =
  | "begin_roadmap_generation"
  | "finish_roadmap_generation"
  | "record_roadmap_memory_candidates"
  | "apply_roadmap_proposal_change"
  | "accept_roadmap_proposal";

type RoadmapFunctionArgs<Name extends RoadmapFunctionName> =
  Database["public"]["Functions"][Name]["Args"];

/**
 * The functions raise a fixed set of messages, so matching them is matching a
 * constant this repository ships alongside the migration, not parsing arbitrary
 * database text. An unrecognized message is the most conservative reason.
 */
function conflictReason(message: string): RoadmapConflictReason {
  if (message.startsWith("That proposal has already been decided")) {
    return "already-decided";
  }
  if (message.startsWith("Decline that proposal")) return "already-decided";
  if (message.startsWith("That proposal is no longer available")) {
    return "not-available";
  }
  if (message.startsWith("That coaching request")) return "not-available";
  if (
    message.startsWith("Your goals changed") ||
    message.startsWith("Your memory changed") ||
    message.startsWith("Your plan changed") ||
    message.startsWith("Your training history changed") ||
    message.startsWith("Memory changed")
  ) {
    return "sources-changed";
  }
  return "stale";
}

type DecisionRow = { decision: string };

function toDecisionList(value: unknown): DecisionRow[] {
  if (Array.isArray(value)) return value as DecisionRow[];
  return value ? [value as DecisionRow] : [];
}

type RequestRow = {
  requested_start_date: string;
  requested_end_date: string;
  regeneration_number: number;
};

function toRequest(value: unknown): RequestRow | null {
  if (Array.isArray(value)) return (value[0] as RequestRow) ?? null;
  return (value as RequestRow) ?? null;
}

function toProposalView(row: {
  id: string;
  origin: string;
  source_proposal_id: string | null;
  planning_note: string | null;
  regeneration_feedback: string | null;
  content: unknown;
  created_at: string;
  roadmap_proposal_decisions: unknown;
  roadmap_generation_requests: unknown;
}): RoadmapProposalView {
  const decisions = toDecisionList(row.roadmap_proposal_decisions);
  const request = toRequest(row.roadmap_generation_requests);

  return {
    id: row.id,
    origin: row.origin as RoadmapProposalOrigin,
    sourceProposalId: row.source_proposal_id,
    content: row.content as RoadmapProposal,
    planningNote: row.planning_note,
    regenerationFeedback: row.regeneration_feedback,
    regenerationNumber: request?.regeneration_number ?? 0,
    startDate: request?.requested_start_date ?? "",
    endDate: request?.requested_end_date ?? "",
    decision: (decisions[0]?.decision as RoadmapDecision) ?? null,
    createdAt: row.created_at,
  };
}

export async function createRoadmapRepository(): Promise<RoadmapRepository> {
  return new RoadmapRepository(await createServerUserClient());
}
