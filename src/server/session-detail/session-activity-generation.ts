import "server-only";

import { createSessionActivitiesCoachAIService } from "@/server/ai/composition";
import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  type SessionActivitiesProposal,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import { createAISpendRepository } from "@/server/repositories/ai-spend-repository";
import type {
  SessionActivityClaim,
  SessionActivityRepository,
} from "@/server/repositories/session-activity-repository";

/**
 * Filling one session: the boundaries in order, as the plan and roadmap put
 * them (ADR-015). Claim one attempt durably; call the coach outside any
 * transaction; persist the validated list with what reached the coach.
 *
 * Only the caller holding `claimed` calls the coach. Every other state stops
 * here and reports what the first attempt did, so an uncertain retry of the
 * same request costs nothing.
 *
 * The result is a proposal and nothing more. Saving the list is the owner's own
 * plan edit through the plan's write rules, and deciding the proposal is a
 * separate call — this module writes nothing to the plan (ADR-020 decision 3:
 * on demand, reviewed, never applied by itself).
 *
 * Whichever coach `createSessionActivitiesCoachAIService` resolves answers;
 * without live enablement that is the example coach, and its result is
 * recorded as `fixture`, which is what the "Example" label reads.
 */

export type SessionActivityGenerationInput = {
  owner: CoachAIOwner;
  sessionId: string;
  /**
   * The session's date, as the caller read it from the plan. The context source
   * reads the session itself and assembly refuses a date that disagrees, so a
   * stale caller is refused rather than answered about the wrong day.
   */
  sessionDate: string;
  expectedPlanRevision: number;
  /** The owner's note for this one request, at most 500 characters. */
  note: string | null;
  /** Stable across an uncertain retry of the same request. */
  idempotencyKey: string;
};

export type SessionActivityGenerationResult =
  | { status: "proposal"; proposalId: string }
  | { status: "pending" }
  | { status: "failed" };

export type SessionActivityGenerationDependencies = {
  requests: SessionActivityRepository;
};

export async function generateSessionActivities(
  input: SessionActivityGenerationInput,
  deps: SessionActivityGenerationDependencies,
): Promise<SessionActivityGenerationResult> {
  const { requests } = deps;

  // A reused key with different input is a conflict, not a replay of another
  // question. The note enters by length: a content hash leaks by comparison.
  const requestFingerprint = [
    "session-activities.v1",
    input.sessionId,
    input.sessionDate,
    String(input.expectedPlanRevision),
    String(input.note?.length ?? 0),
  ].join(":");

  const claim: SessionActivityClaim = await requests.beginGeneration({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    sessionId: input.sessionId,
    expectedPlanRevision: input.expectedPlanRevision,
    note: input.note,
  });

  if (claim.state !== "claimed") {
    if (claim.state === "completed" && claim.proposalId) {
      return { status: "proposal", proposalId: claim.proposalId };
    }
    if (claim.state === "failed") return { status: "failed" };
    return { status: "pending" };
  }

  // Composed inside the try, so a live refusal while composing closes the
  // claim like any other failure instead of leaving it pending (A7-1's fix,
  // kept from the start here). The ledger is always passed; a fixture run
  // never reads it.
  let binding;
  let outcome;
  try {
    const composition = createSessionActivitiesCoachAIService({
      owner: input.owner,
      sessionId: input.sessionId,
      spendLedger: await createAISpendRepository(),
    });
    binding = composition.binding;
    outcome = await composition.service.propose({
      operation: "fill_session_activities",
      owner: input.owner,
      idempotencyKey: input.idempotencyKey,
      compose: {
        horizonStartDate: input.sessionDate,
        horizonEndDate: input.sessionDate,
        planningNote: input.note,
        regenerationFeedback: null,
        previousProposal: null,
        sessionId: input.sessionId,
      },
    });
  } catch (error) {
    const code =
      error instanceof CoachAIError ? error.code : "provider_unavailable";
    await requests
      .finishGenerationAsFailed(claim.completionToken, code)
      .catch(() => {
        // A failed close leaves an honest pending attempt, and must not
        // replace the original cause.
      });
    throw error;
  }

  const proposalId = await requests.finishGenerationWithProposal({
    completionToken: claim.completionToken,
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.fill_session_activities,
    promptVersion: COACH_AI_PROMPT_VERSIONS.fill_session_activities,
    providerCode: binding.providerCode,
    modelCode: binding.modelCode,
    rateCardVersion: binding.rateCard.version,
    spendReservationId: outcome.spendReservationId,
    note: input.note,
    content: outcome.proposal as SessionActivitiesProposal,
    sources: outcome.sources,
  });

  return { status: "proposal", proposalId };
}
