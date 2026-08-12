import "server-only";

import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  type SevenDayPlanProposal,
} from "@/server/ai/contracts";
import {
  buildCoachAIContext,
  CoachAIContextBelowMinimumError,
  isResolvedTimezone,
  type CoachAIOwnedRecords,
} from "@/server/ai/context";
import {
  RepositoryCoachAIContextSource,
  type CoachAIContextSource,
} from "@/server/ai/context-source";
import { createPlanCoachAIService } from "@/server/ai/composition";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import { derivePlanHorizon, resolveOwnerToday } from "@/server/ai/plan-horizon";
import type { CoachAISpendLedger } from "@/server/ai/spend";
import type { PlanProposalRepository } from "@/server/repositories/plan-proposal-repository";
import { decidePlanSafety } from "@/server/plan-proposal/plan-safety";

export type PlanProposalGenerationInput = {
  owner: CoachAIOwner;
  timezoneName: string;
  startDate: string;
  dayCount: number;
  planningNote: string | null;
  idempotencyKey: string;
};

export type PlanProposalGenerationResult =
  | { status: "proposal"; proposalId: string; memoryCandidateCount: number }
  | { status: "safety-hold" }
  | { status: "pending" }
  | { status: "failed"; code: string };

type ContextReaders = {
  goals: ConstructorParameters<typeof RepositoryCoachAIContextSource>[0];
  memory: ConstructorParameters<typeof RepositoryCoachAIContextSource>[1];
  completions: ConstructorParameters<typeof RepositoryCoachAIContextSource>[2];
  plans: ConstructorParameters<typeof RepositoryCoachAIContextSource>[3];
};

export type PlanProposalGenerationDependencies = ContextReaders & {
  proposals: Pick<
    PlanProposalRepository,
    | "beginGeneration"
    | "finishGenerationWithProposal"
    | "finishGenerationAsFailed"
    | "recordMemoryCandidates"
  >;
  spendLedger?: CoachAISpendLedger;
  now?: () => Date;
  fixtureCaseName?: string;
};

/**
 * Preflight, claim, fixture, persist, then memory candidates. In particular,
 * context minimum and the server safety tier are both resolved before the
 * durable claim, so either refusal consumes neither an idempotency key nor a
 * spend reservation.
 */
export async function generatePlanProposal(
  input: PlanProposalGenerationInput,
  deps: PlanProposalGenerationDependencies,
): Promise<PlanProposalGenerationResult> {
  if (!isResolvedTimezone(input.timezoneName)) {
    throw new CoachAIContextBelowMinimumError(["resolved_timezone"]);
  }
  const today = resolveOwnerToday(
    input.timezoneName,
    deps.now?.() ?? new Date(),
  );
  const horizon = derivePlanHorizon({
    today,
    startDate: input.startDate,
    dayCount: input.dayCount,
  });

  const source = new RepositoryCoachAIContextSource(
    deps.goals,
    deps.memory,
    deps.completions,
    deps.plans,
    () => today,
    () => input.timezoneName,
  );
  const records = await source.load(input.owner);
  if (records.ownerId !== input.owner.id)
    throw new CoachAIError("context_invalid");

  const compose = {
    horizonStartDate: horizon.startDate,
    horizonEndDate: horizon.endDate,
    planningNote: input.planningNote,
    regenerationFeedback: null,
    previousProposal: null,
  } as const;

  // Enforces the minimum before a durable request row exists.
  const assembled = buildCoachAIContext(
    "create_seven_day_plan",
    records,
    compose,
  );

  const safety = decidePlanSafety(assembled.context);
  if (safety.generation === "pause-all") return { status: "safety-hold" };

  const requestFingerprint = [
    "plan.v2",
    horizon.startDate,
    String(horizon.dayCount),
    String(records.goalCollectionRevision),
    String(records.memoryCollectionRevision),
    String(input.planningNote?.length ?? 0),
  ].join(":");

  const claim = await deps.proposals.beginGeneration({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    startDate: horizon.startDate,
    dayCount: horizon.dayCount,
    planningNote: input.planningNote,
  });

  if (claim.state !== "claimed") {
    if (claim.state === "completed") {
      return {
        status: "proposal",
        proposalId: claim.proposalId as string,
        memoryCandidateCount: 0,
      };
    }
    if (claim.state === "failed") {
      return { status: "failed", code: "provider_unavailable" };
    }
    return { status: "pending" };
  }

  const { service, binding } = createPlanCoachAIService({
    owner: input.owner,
    contextSource: new LoadedContextSource(records),
    ...(deps.spendLedger ? { spendLedger: deps.spendLedger } : {}),
    ...(deps.fixtureCaseName ? { fixtureCaseName: deps.fixtureCaseName } : {}),
    // M3-03 is intentionally network-free in every environment. A live path
    // needs a later, explicit product-owner authorization and is not latent in
    // this surface.
    environment: {},
  });

  let outcome;
  try {
    outcome = await service.propose({
      operation: "create_seven_day_plan",
      owner: input.owner,
      idempotencyKey: input.idempotencyKey,
      compose,
    });
  } catch (error) {
    const code =
      error instanceof CoachAIError ? error.code : "provider_unavailable";
    await deps.proposals
      .finishGenerationAsFailed(claim.completionToken, code)
      .catch(() => {});
    throw error;
  }

  const proposalId = await deps.proposals.finishGenerationWithProposal({
    completionToken: claim.completionToken,
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    promptVersion: COACH_AI_PROMPT_VERSIONS.create_seven_day_plan,
    providerCode: binding.providerCode,
    modelCode: binding.modelCode,
    rateCardVersion: binding.rateCard.version,
    spendReservationId: outcome.spendReservationId,
    planningNote: input.planningNote,
    content: outcome.proposal as SevenDayPlanProposal,
    sources: outcome.sources,
  });

  let memoryCandidateCount = 0;
  if (outcome.memoryCandidates.length > 0) {
    try {
      const receipt = await deps.proposals.recordMemoryCandidates({
        completionToken: claim.completionToken,
        expectedMemoryRevision: records.memoryCollectionRevision,
        candidates: outcome.memoryCandidates,
      });
      memoryCandidateCount = receipt.itemIds.length;
    } catch {
      // Independent decision boundary: a memory conflict never rolls back a
      // valid proposal, and no candidate becomes active here.
    }
  }

  return { status: "proposal", proposalId, memoryCandidateCount };
}

class LoadedContextSource implements CoachAIContextSource {
  constructor(private readonly records: CoachAIOwnedRecords) {}
  async load(): Promise<CoachAIOwnedRecords> {
    return this.records;
  }
}
