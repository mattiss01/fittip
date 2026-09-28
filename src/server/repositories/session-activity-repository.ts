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
  CoachAISourceReference,
  SessionActivitiesProposal,
} from "@/server/ai/contracts";

/**
 * The only application path to the three A7-3 functions.
 *
 * Every write goes through a `SECURITY DEFINER` function that derives its own
 * owner from `auth.uid()`; nothing here passes an owner id, and no function
 * accepts one. What this module owns is the mapping from a Postgres code to
 * something a screen can act on, and nothing that reaches a screen is derived
 * from a database message.
 *
 * No call disables retries: every function here is idempotent in the database
 * — a repeated claim replays, a repeated finish replays, a repeated decision
 * replays — so an automatically retried dropped response writes nothing twice.
 */

type SessionActivityClient = SupabaseClient<Database> | ServerUserClient;

export class SessionActivityAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "SessionActivityAuthenticationError";
  }
}

export class SessionActivityPersistenceError extends Error {
  constructor() {
    // Deliberately says nothing about the cause. A database message can carry a
    // constraint name, a column, or a value.
    super("The session activities could not be saved.");
    this.name = "SessionActivityPersistenceError";
  }
}

export type SessionActivityConflictReason =
  /** The session is gone, cancelled, or not this owner's. */
  | "session-unavailable"
  /** The session's day has passed. */
  | "session-past"
  /** The same key was used for a different request. */
  | "request-changed"
  /** The proposal was already decided the other way. */
  | "already-decided"
  /** Anything else the database reported as a conflict. */
  | "stale";

export class SessionActivityConflictError extends Error {
  constructor(readonly reason: SessionActivityConflictReason) {
    super("That session changed. Reload and try again.");
    this.name = "SessionActivityConflictError";
  }
}

export type SessionActivityClaim = {
  generationId: string;
  completionToken: string;
  /** Only `claimed` authorizes a provider call; a replay returns its state. */
  state: "claimed" | "pending" | "completed" | "failed";
  proposalId: string | null;
};

export type SessionActivityDecision = "accepted" | "dismissed";

export type SessionActivityProposalView = {
  id: string;
  /** Null once the session it was for has been deleted. */
  sessionId: string | null;
  localDate: string;
  providerCode: string;
  note: string | null;
  content: SessionActivitiesProposal;
  decision: SessionActivityDecision | null;
  createdAt: string;
};

export class SessionActivityRepository {
  constructor(private readonly client: SessionActivityClient) {}

  async beginGeneration(input: {
    idempotencyKey: string;
    requestFingerprint: string;
    sessionId: string;
    expectedPlanRevision: number;
    note: string | null;
  }): Promise<SessionActivityClaim> {
    const data = await this.call("begin_session_activity_generation", {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_session_id: input.sessionId,
      p_expected_plan_revision: input.expectedPlanRevision,
      ...(input.note === null ? {} : { p_note: input.note }),
    });
    return {
      generationId: String(data.generation_id),
      completionToken: String(data.completion_token),
      state: data.state as SessionActivityClaim["state"],
      proposalId: data.proposal_id ? String(data.proposal_id) : null,
    };
  }

  /** Persist a validated list with what reached the coach to produce it. */
  async finishGenerationWithProposal(input: {
    completionToken: string;
    schemaVersion: string;
    promptVersion: string;
    providerCode: string;
    modelCode: string;
    rateCardVersion: string;
    spendReservationId: string | null;
    /** Travels again so the function can prove it against the claim's hash. */
    note: string | null;
    content: SessionActivitiesProposal;
    sources: readonly CoachAISourceReference[];
  }): Promise<string> {
    const data = await this.call("finish_session_activity_generation", {
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
      ...(input.note === null ? {} : { p_note: input.note }),
      p_content: input.content as unknown as Json,
      p_sources: input.sources as unknown as Json,
    });
    if (!data.proposal_id) throw new SessionActivityPersistenceError();
    return String(data.proposal_id);
  }

  /** Close a claimed attempt that produced nothing, with a bounded code. */
  async finishGenerationAsFailed(
    completionToken: string,
    safeFailureCode: string,
  ): Promise<void> {
    await this.call("finish_session_activity_generation", {
      p_completion_token: completionToken,
      p_outcome: "failed",
      p_safe_failure_code: safeFailureCode,
    });
  }

  /** Final once written; the same decision again is a harmless replay. */
  async decide(
    proposalId: string,
    decision: SessionActivityDecision,
  ): Promise<SessionActivityDecision> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(
      "decide_session_activity_proposal",
      { p_proposal_id: proposalId, p_decision: decision },
    );
    if (error) throw toDomainError(error);
    if (data !== "accepted" && data !== "dismissed") {
      throw new SessionActivityPersistenceError();
    }
    return data;
  }

  /** The owner's own proposal, read through their SELECT policy. */
  async getProposal(
    proposalId: string,
  ): Promise<SessionActivityProposalView | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("session_activity_proposals")
      .select(PROPOSAL_COLUMNS)
      .eq("user_id", userId)
      .eq("id", proposalId)
      .maybeSingle();
    if (error) throw new SessionActivityPersistenceError();
    if (!data) return null;

    return toProposalView(data);
  }

  /**
   * The newest undecided proposal for each of these sessions, so a suggestion
   * the owner neither accepted nor dismissed is still there when they open the
   * session again (A7-4, owner's choice of 28 Sep 2026).
   */
  async listOpenProposals(
    sessionIds: readonly string[],
  ): Promise<SessionActivityProposalView[]> {
    if (sessionIds.length === 0) return [];
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("session_activity_proposals")
      .select(PROPOSAL_COLUMNS)
      .eq("user_id", userId)
      .in("session_id", [...sessionIds])
      .order("created_at", { ascending: false });
    if (error) throw new SessionActivityPersistenceError();

    const newest = new Map<string, SessionActivityProposalView>();
    for (const row of data ?? []) {
      const view = toProposalView(row);
      if (view.decision !== null || view.sessionId === null) continue;
      if (!newest.has(view.sessionId)) newest.set(view.sessionId, view);
    }
    return [...newest.values()];
  }

  private async call(
    name:
      | "begin_session_activity_generation"
      | "finish_session_activity_generation",
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(name, args as never);
    if (error) throw toDomainError(error);
    if (!data) throw new SessionActivityPersistenceError();
    return data as unknown as Record<string, unknown>;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new SessionActivityAuthenticationError(error);
      }
      throw new SessionActivityAuthenticationError();
    }
  }
}

const PROPOSAL_COLUMNS =
  "id, session_id, local_date, provider_code, note, content, created_at, session_activity_decisions ( decision )" as const;

type ProposalRow = {
  id: string;
  session_id: string | null;
  local_date: string;
  provider_code: string;
  note: string | null;
  content: Json;
  created_at: string;
  session_activity_decisions:
    | { decision: string }
    | { decision: string }[]
    | null;
};

function toProposalView(data: ProposalRow): SessionActivityProposalView {
  const decisionRow = Array.isArray(data.session_activity_decisions)
    ? data.session_activity_decisions[0]
    : data.session_activity_decisions;
  const decision = decisionRow?.decision ?? null;
  return {
    id: data.id,
    sessionId: data.session_id,
    localDate: data.local_date,
    providerCode: data.provider_code,
    note: data.note,
    content: data.content as unknown as SessionActivitiesProposal,
    decision:
      decision === "accepted" || decision === "dismissed" ? decision : null,
    createdAt: data.created_at,
  };
}

/**
 * The functions raise a fixed set of codes and messages this repository ships
 * with the migration, so matching them is matching a constant. Anything else
 * is an opaque failure.
 */
function toDomainError(error: { code?: string; message?: string }): Error {
  if (error.code === "42501") return new SessionActivityAuthenticationError();
  if (error.code === "PT422") {
    return new SessionActivityConflictError("session-past");
  }
  if (error.code === "PT433") {
    return new SessionActivityConflictError("already-decided");
  }
  if (error.code === "PT409") {
    const message = error.message ?? "";
    if (
      message.startsWith("That session is no longer available") ||
      message.startsWith("That proposal is no longer available")
    ) {
      return new SessionActivityConflictError("session-unavailable");
    }
    if (message.startsWith("That coaching request changed")) {
      return new SessionActivityConflictError("request-changed");
    }
    return new SessionActivityConflictError("stale");
  }
  return new SessionActivityPersistenceError();
}

export async function createSessionActivityRepository(): Promise<SessionActivityRepository> {
  return new SessionActivityRepository(await createServerUserClient());
}
