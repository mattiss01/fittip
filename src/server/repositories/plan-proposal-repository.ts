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
import type { PlanProposalView } from "@/server/plan-proposal/plan-proposal-records";

type PlanProposalClient = SupabaseClient<Database> | ServerUserClient;

const PROPOSAL_COLUMNS =
  "id, planning_note, content, created_at, generation_request_id" as const;

export class PlanProposalAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "PlanProposalAuthenticationError";
  }
}

export class PlanProposalPersistenceError extends Error {
  constructor() {
    super("The plan proposal could not be saved.");
    this.name = "PlanProposalPersistenceError";
  }
}

export class PlanProposalConflictError extends Error {
  constructor() {
    super("That plan proposal changed. Review it again.");
    this.name = "PlanProposalConflictError";
  }
}

export type PlanGenerationClaim = {
  generationId: string;
  completionToken: string;
  state: "claimed" | "pending" | "completed" | "failed";
  proposalId: string | null;
};

export class PlanProposalRepository {
  constructor(private readonly client: PlanProposalClient) {}

  async getRememberedDayCount(): Promise<number | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_generation_requests")
      .select("day_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new PlanProposalPersistenceError();
    return data ? Number(data.day_count) : null;
  }

  async getOpenProposal(): Promise<PlanProposalView | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposals")
      .select(
        `${PROPOSAL_COLUMNS}, plan_proposal_decisions(decision), plan_generation_requests(requested_start_date, requested_end_date, day_count)`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new PlanProposalPersistenceError();

    const open = data.find(
      (row) => toDecisionList(row.plan_proposal_decisions).length === 0,
    );
    return open ? toProposalView(open) : null;
  }

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

  async beginGeneration(input: {
    idempotencyKey: string;
    requestFingerprint: string;
    startDate: string;
    dayCount: number;
    planningNote: string | null;
  }): Promise<PlanGenerationClaim> {
    const data = await this.call("begin_plan_generation", {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_start_date: input.startDate,
      p_day_count: input.dayCount,
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
    sources: CoachAISourceReference[];
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
      p_sources: input.sources as unknown as Json,
    });
    if (!data.proposal_id) throw new PlanProposalPersistenceError();
    return String(data.proposal_id);
  }

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
    const ids = Array.isArray(data.item_ids) ? data.item_ids : [];
    return {
      collectionRevision: Number(data.collection_revision ?? 0),
      itemIds: ids.map(String),
    };
  }

  async rejectProposal(proposalId: string): Promise<void> {
    await this.call("reject_plan_proposal", { p_proposal_id: proposalId });
  }

  private async call<Name extends PlanFunctionName>(
    name: Name,
    args: PlanFunctionArgs<Name>,
  ): Promise<Record<string, unknown>> {
    await this.getVerifiedUserId();
    const { data, error } = await this.client.rpc(name, args as never);
    if (error) {
      if (error.code === "PT409") throw new PlanProposalConflictError();
      throw new PlanProposalPersistenceError();
    }
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

type PlanFunctionName =
  | "begin_plan_generation"
  | "finish_plan_generation"
  | "record_plan_memory_candidates"
  | "reject_plan_proposal";
type PlanFunctionArgs<Name extends PlanFunctionName> =
  Database["public"]["Functions"][Name]["Args"];

function toDecisionList(value: unknown): { decision: string }[] {
  if (Array.isArray(value)) return value as { decision: string }[];
  return value ? [value as { decision: string }] : [];
}

type PlanRequestRow = {
  requested_start_date: string;
  requested_end_date: string;
  day_count: number;
};

function toRequest(value: unknown): PlanRequestRow | null {
  if (Array.isArray(value)) return (value[0] as PlanRequestRow) ?? null;
  return (value as PlanRequestRow) ?? null;
}

function toProposalView(row: {
  id: string;
  planning_note: string | null;
  content: unknown;
  created_at: string;
  plan_proposal_decisions: unknown;
  plan_generation_requests: unknown;
}): PlanProposalView {
  const request = toRequest(row.plan_generation_requests);
  const decisions = toDecisionList(row.plan_proposal_decisions);
  return {
    id: row.id,
    content: row.content as unknown as SevenDayPlanProposal,
    planningNote: row.planning_note,
    startDate: request?.requested_start_date ?? "",
    endDate: request?.requested_end_date ?? "",
    dayCount: Number(request?.day_count ?? 0),
    decision: decisions[0]?.decision === "rejected" ? "rejected" : null,
    createdAt: row.created_at,
  };
}

export async function createPlanProposalRepository(): Promise<PlanProposalRepository> {
  return new PlanProposalRepository(await createServerUserClient());
}
