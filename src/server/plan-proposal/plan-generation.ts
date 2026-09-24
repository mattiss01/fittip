import "server-only";

import { createPlanCoachAIService } from "@/server/ai/composition";
import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIPreviousPlanReference,
  type SevenDayPlanProposal,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import type {
  PlanGenerationClaim,
  PlanProposalRepository,
} from "@/server/repositories/plan-proposal-repository";

/**
 * The generation operation: the one place the boundaries are put in order.
 *
 * ADR-015's shape, stated as code, and the same order `generateRoadmapProposal`
 * uses. Claim one attempt durably; call the coach **outside** any transaction;
 * persist the validated proposal. The coach call cannot be inside a database
 * transaction — it holds locks across an external deadline and cannot be made
 * atomic with Postgres — and a unique proposal row alone would not stop two
 * serverless instances both calling before either tried to insert.
 *
 * The claim is what closes that race, and it is also what makes an uncertain
 * retry cheap: the same key returns the existing claim, and only the caller
 * whose insert opened the attempt — the one holding `claimed` — calls the coach
 * at all. Every other state stops here.
 *
 * ## Which coach answers
 *
 * Whichever `createPlanCoachAIService` resolves, which without
 * `FITTIP_AI_LIVE=enabled` and an approved runtime is `FixtureCoachAI`. This
 * module does not read that flag, does not pass an environment, and has no
 * branch on the answer: it records whatever provider and model the resolved
 * binding names. A fixture result is recorded as `fixture` and is labelled an
 * example wherever it is shown.
 *
 * ## Memory candidates
 *
 * A planning note that states a durable constraint can now propose it. The
 * batch is recorded after the proposal has committed, in its own transaction,
 * and its failure is swallowed: one memory conflict must not roll back a valid
 * plan proposal. That is ADR-015's boundary and the shape
 * `generateRoadmapProposal` already uses.
 *
 * Nothing here decides anything about memory. The route it calls can create
 * only `proposed` items -- ADR-010 decision 16 -- and the owner accepts or
 * declines them on the memory surface, which owns that decision.
 */

export type PlanGenerationInput = {
  owner: CoachAIOwner;
  /** The owner's local today, from their confirmed zone, revalidated server-side. */
  startDate: string;
  endDate: string;
  dayCount: number;
  expectedPlanRevision: number;
  planningNote: string | null;
  /** Stable across an uncertain retry of the same compose submission. */
  idempotencyKey: string;
  /**
   * The proposal this one replaces, and what was wrong with it. Both or
   * neither: the database refuses one without the other, because feedback with
   * nothing to attach it to is a complaint about nothing and a proposal without
   * feedback is a question already paid for.
   *
   * The proposal must already be closed. Closing it is what keeps whatever the
   * owner accepted — `finish_plan_proposal_review` applies the staged items
   * into the plan first, so by the time this runs those days are plan sessions
   * the coach will see as commitments and plan around.
   */
  previousProposalId?: string | null;
  regenerationFeedback?: string | null;
};

export type PlanGenerationResult =
  | { status: "proposal"; proposalId: string; memoryCandidateCount: number }
  | { status: "pending" }
  | { status: "failed" };

export type PlanGenerationDependencies = {
  proposals: PlanProposalRepository;
};

export async function generatePlanProposal(
  input: PlanGenerationInput,
  deps: PlanGenerationDependencies,
): Promise<PlanGenerationResult> {
  const { proposals } = deps;

  // The fingerprint is what makes a reused key with different input a conflict
  // rather than a silent replay of somebody else's question. It carries the
  // horizon, the plan revision, and the *length* of the owner text — a length
  // rather than the content, because a content hash leaks by comparison.
  // The previous proposal is read before the claim, so a regeneration naming
  // something unreadable fails before anything is reserved or paid for.
  let previousPlan: CoachAIPreviousPlanReference | null = null;
  if (input.previousProposalId) {
    const previous = await proposals.getProposal(input.previousProposalId);
    if (previous === null) {
      throw new CoachAIError("context_invalid");
    }
    previousPlan = reducePreviousPlan(previous.content);
  }

  const requestFingerprint = [
    "seven-day-plan.v2",
    input.startDate,
    input.endDate,
    String(input.expectedPlanRevision),
    String(input.planningNote?.length ?? 0),
    // The same key with different feedback is a different question, so the
    // fingerprint carries its length for the reason it carries the note's: a
    // reused key must not silently replay somebody else's complaint, and a
    // content hash would leak by comparison.
    String(input.regenerationFeedback?.length ?? 0),
    input.previousProposalId ?? "none",
  ].join(":");

  const claim: PlanGenerationClaim = await proposals.beginGeneration({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    startDate: input.startDate,
    dayCount: input.dayCount,
    expectedPlanRevision: input.expectedPlanRevision,
    planningNote: input.planningNote,
    previousProposalId: input.previousProposalId ?? null,
    regenerationFeedback: input.regenerationFeedback ?? null,
  });

  // An uncertain same-key retry stops here. Only `claimed` — the state the
  // database returns to the caller whose insert opened the attempt — continues
  // to the coach; anything else is a replay and must not buy a second call.
  // A genuinely concurrent loser is reported as pending rather than retried,
  // because the coach may already have answered and, on a live binding, already
  // have been paid.
  if (claim.state !== "claimed") {
    if (claim.state === "completed" && claim.proposalId !== null) {
      // A replay reports no candidates rather than counting them again. The
      // count describes what this call created, and this call created nothing;
      // what is actually waiting is read from the memory surface.
      return {
        status: "proposal",
        proposalId: claim.proposalId,
        memoryCandidateCount: 0,
      };
    }
    if (claim.state === "failed") return { status: "failed" };
    return { status: "pending" };
  }

  // No context source and no environment are passed. Production has exactly one
  // of each, and a parameter here would be a way for a caller to choose
  // something else.
  const { service, binding } = createPlanCoachAIService({ owner: input.owner });

  let outcome;
  try {
    outcome = await service.propose({
      operation: "create_seven_day_plan",
      owner: input.owner,
      idempotencyKey: input.idempotencyKey,
      compose: {
        horizonStartDate: input.startDate,
        horizonEndDate: input.endDate,
        planningNote: input.planningNote,
        regenerationFeedback: input.regenerationFeedback ?? null,
        previousProposal: previousPlan,
      },
    });
  } catch (error) {
    // The claim is closed with a bounded code so the owner is not left behind a
    // pending attempt they cannot clear.
    const code =
      error instanceof CoachAIError ? error.code : "provider_unavailable";
    await proposals
      .finishGenerationAsFailed(claim.completionToken, code)
      .catch(() => {
        // A failed close leaves an honest pending attempt. It is never
        // automatically retried, and it must not replace the original cause.
      });
    throw error;
  }

  const proposalId = await proposals.finishGenerationWithProposal({
    completionToken: claim.completionToken,
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    promptVersion: COACH_AI_PROMPT_VERSIONS.create_seven_day_plan,
    providerCode: binding.providerCode,
    modelCode: binding.modelCode,
    rateCardVersion: binding.rateCard.version,
    spendReservationId: outcome.spendReservationId,
    planningNote: input.planningNote,
    regenerationFeedback: input.regenerationFeedback ?? null,
    content: outcome.proposal as SevenDayPlanProposal,
    sources: outcome.sources,
  });

  return {
    status: "proposal",
    proposalId,
    memoryCandidateCount: await recordMemoryCandidates(
      proposals,
      claim.completionToken,
      input.startDate,
      outcome.memoryCandidates,
    ),
  };
}

/**
 * The candidate batch, in its own transaction after the proposal has committed.
 *
 * Its failure is swallowed on purpose: one memory conflict must not roll back a
 * valid plan proposal, which is the boundary ADR-015 draws and the alternative
 * it explicitly rejected. Zero here means "none were created", not "none were
 * proposed", and the memory surface is where a candidate is actually decided
 * either way.
 */
async function recordMemoryCandidates(
  proposals: PlanProposalRepository,
  completionToken: string,
  today: string,
  candidates: readonly { memoryType: string; sourceExcerpt: string }[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  try {
    const memory = await (await createMemoryRepository()).list(today);
    const receipt = await proposals.recordMemoryCandidates({
      completionToken,
      expectedMemoryRevision: memory.revision,
      candidates: candidates as Parameters<
        PlanProposalRepository["recordMemoryCandidates"]
      >[0]["candidates"],
    });
    return receipt.itemIds.length;
  } catch {
    return 0;
  }
}

/**
 * What the coach is shown of the plan it is replacing.
 *
 * The date, the title, the sport and the duration — enough to see what it
 * proposed and not repeat it — and nothing else. The per-session rationale is
 * left out deliberately: it is the bulkiest part of a proposal and the part
 * least worth defending a second time, since the owner has just said the
 * proposal was wrong.
 *
 * Bounded by the context's own `previous_proposal` allocation rather than here.
 * A seven-day plan reduces to well under it; the ceiling exists for the day
 * that stops being true, and it refuses rather than silently truncates.
 */
function reducePreviousPlan(
  content: SevenDayPlanProposal,
): CoachAIPreviousPlanReference {
  return {
    weekDescription: content.weekDescription,
    days: content.sessions.map((session) => ({
      date: session.date,
      title: session.title,
      sport: session.sport,
      durationMinutes: session.durationMinutes,
    })),
  };
}
