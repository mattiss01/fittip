import "server-only";

import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIPreviousProposalReference,
  type RoadmapProposal,
} from "@/server/ai/contracts";
import { createRoadmapCoachAIService } from "@/server/ai/composition";
import { RepositoryCoachAIContextSource } from "@/server/ai/context-source";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { RoadmapRepository } from "@/server/repositories/roadmap-repository";
import {
  RoadmapConflictError,
  type RoadmapGenerationClaim,
} from "@/server/repositories/roadmap-repository";
import type { CoachAISpendLedger } from "@/server/ai/spend";
import { addDays } from "@/server/roadmap/roadmap-records";

/**
 * The generation operation, and the one place the four boundaries are put in
 * order.
 *
 * ADR-015's shape, stated as code: claim one paid attempt durably, call the
 * provider **outside** any transaction, persist the validated proposal, then
 * create memory candidates in a separate transaction whose failure leaves the
 * roadmap valid. The provider call cannot be inside a database transaction —
 * it holds locks across an external deadline and cannot be made atomic with
 * Postgres — and a unique proposal row alone would not prevent two serverless
 * instances both calling the provider before either tried to insert.
 *
 * The claim is what closes that race, and it is also what makes an uncertain
 * retry cheap: the same key returns the existing claim, and a caller holding a
 * `pending`, `completed` or `failed` state invokes no provider at all.
 */

export type RoadmapGenerationInput = {
  owner: CoachAIOwner;
  /** The owner's local today, from the browser, revalidated server-side. */
  startDate: string;
  endDate: string;
  expectedHeadRevision: number;
  planningNote: string | null;
  /** Both present together, or both absent. A regeneration needs both. */
  previousProposalId: string | null;
  regenerationFeedback: string | null;
  /** Stable across an uncertain retry of the same compose submission. */
  idempotencyKey: string;
};

export type RoadmapGenerationResult =
  | { status: "proposal"; proposalId: string; memoryCandidateCount: number }
  | { status: "pending" }
  | { status: "failed"; code: string };

export type RoadmapGenerationDependencies = {
  roadmaps: RoadmapRepository;
  goals: ConstructorParameters<typeof RepositoryCoachAIContextSource>[0];
  memory: ConstructorParameters<typeof RepositoryCoachAIContextSource>[1];
  completions: ConstructorParameters<typeof RepositoryCoachAIContextSource>[2];
  plans: ConstructorParameters<typeof RepositoryCoachAIContextSource>[3];
  spendLedger?: CoachAISpendLedger;
  environment?: Record<string, string | undefined>;
  /** The fixture case a network-free run answers with. */
  fixtureCaseName?: string;
};

/**
 * The reduced form of the previous proposal that travels on a regeneration.
 *
 * ADR-014 decision 2a says only the immediately previous proposal travels,
 * never the chain. It does not say the whole envelope must: a v2 proposal is
 * capped at 16,000 bytes and the entire context budget is 24,000, so sending
 * one verbatim would leave nothing for the goals, memory and history that make
 * the critique meaningful. What the coach needs to act on feedback is the shape
 * it produced — the title, the summary, and each phase's focus and dates.
 */
export function reducePreviousProposal(
  content: RoadmapProposal,
): CoachAIPreviousProposalReference {
  return {
    title: content.title,
    summary: content.summary,
    phases: content.phases.map((phase) => ({
      title: phase.title,
      focus: phase.focus,
      startDate: phase.startDate,
      endDate: phase.endDate,
    })),
  };
}

export async function generateRoadmapProposal(
  input: RoadmapGenerationInput,
  deps: RoadmapGenerationDependencies,
): Promise<RoadmapGenerationResult> {
  const isRegeneration = input.previousProposalId !== null;

  // The predecessor is read before the claim, because a regeneration that
  // cannot find its predecessor should fail before it consumes a key.
  let previousProposal: CoachAIPreviousProposalReference | null = null;
  if (isRegeneration) {
    const previous = await deps.roadmaps.getProposal(
      input.previousProposalId as string,
    );
    if (!previous) throw new RoadmapConflictError("not-available");
    previousProposal = reducePreviousProposal(previous.content);
  }

  // The fingerprint is what makes a reused key with different input a conflict
  // rather than a silent replay of somebody else's question. It carries the
  // horizon, the lineage and the *lengths* of the owner text — lengths rather
  // than content, because a content hash leaks by comparison.
  const requestFingerprint = [
    "roadmap.v2",
    input.startDate,
    input.endDate,
    String(input.expectedHeadRevision),
    input.previousProposalId ?? "initial",
    String(input.planningNote?.length ?? 0),
    String(input.regenerationFeedback?.length ?? 0),
  ].join(":");

  const claim: RoadmapGenerationClaim = await deps.roadmaps.beginGeneration({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    startDate: input.startDate,
    endDate: input.endDate,
    expectedHeadRevision: input.expectedHeadRevision,
    planningNote: input.planningNote,
    previousProposalId: input.previousProposalId,
    regenerationFeedback: input.regenerationFeedback,
  });

  // An uncertain same-key retry stops here. A `pending` claim is an attempt
  // this process lost track of; it is reported honestly rather than retried,
  // because the provider may already have generated — and charged for — a
  // response. A regeneration deliberately uses a new key instead.
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

  const contextSource = new RepositoryCoachAIContextSource(
    deps.goals,
    deps.memory,
    deps.completions,
    deps.plans,
    () => input.startDate,
  );

  const { service, binding } = createRoadmapCoachAIService({
    owner: input.owner,
    contextSource,
    ...(deps.spendLedger ? { spendLedger: deps.spendLedger } : {}),
    ...(deps.environment ? { environment: deps.environment } : {}),
    ...(deps.fixtureCaseName
      ? { fixtureCaseName: deps.fixtureCaseName }
      : {}),
  });

  let outcome;
  try {
    outcome = await service.propose({
      operation: "create_roadmap",
      owner: input.owner,
      idempotencyKey: input.idempotencyKey,
      compose: {
        horizonStartDate: input.startDate,
        horizonEndDate: input.endDate,
        planningNote: input.planningNote,
        regenerationFeedback: input.regenerationFeedback,
        previousProposal,
      },
    });
  } catch (error) {
    // The claim is closed with a bounded code so the owner is not left behind a
    // pending attempt they cannot clear. The code is from a fixed enum; no
    // provider text, prompt, or raw error reaches the database.
    const code = error instanceof CoachAIError ? error.code : "provider_unavailable";
    await deps.roadmaps
      .finishGenerationAsFailed(claim.completionToken, code)
      .catch(() => {
        // A failed close leaves an honest pending attempt. It is never
        // automatically retried, and it must not replace the original cause.
      });
    throw error;
  }

  const proposalId = await deps.roadmaps.finishGenerationWithProposal({
    completionToken: claim.completionToken,
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_roadmap,
    promptVersion: COACH_AI_PROMPT_VERSIONS.create_roadmap,
    providerCode: binding.providerCode,
    modelCode: binding.modelCode,
    rateCardVersion: binding.rateCard.version,
    spendReservationId: outcome.spendReservationId,
    planningNote: input.planningNote,
    regenerationFeedback: input.regenerationFeedback,
    content: outcome.proposal as RoadmapProposal,
    sources: outcome.sources,
  });

  // A separate transaction, after the roadmap has committed. Its failure is
  // swallowed on purpose: one memory conflict must not roll back a valid
  // roadmap, which is the boundary decision 4b draws and the alternative
  // ADR-015 explicitly rejected.
  let memoryCandidateCount = 0;
  if (outcome.memoryCandidates.length > 0) {
    const memoryCollection = await deps.memory.list(input.startDate);
    try {
      const receipt = await deps.roadmaps.recordMemoryCandidates({
        completionToken: claim.completionToken,
        expectedMemoryRevision: memoryCollection.revision,
        candidates: outcome.memoryCandidates,
      });
      memoryCandidateCount = receipt.itemIds.length;
    } catch {
      memoryCandidateCount = 0;
    }
  }

  return { status: "proposal", proposalId, memoryCandidateCount };
}

/** The forward window the roadmap's plan commitments are read against. */
export function roadmapForwardWindowEnd(today: string): string {
  return addDays(today, 180);
}
