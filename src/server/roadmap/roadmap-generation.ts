import "server-only";

import { createRoadmapCoachAIService } from "@/server/ai/composition";
import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIPreviousProposalReference,
  type RoadmapProposal,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import {
  RoadmapConflictError,
  type RoadmapGenerationClaim,
  type RoadmapRepository,
} from "@/server/repositories/roadmap-repository";

/**
 * The generation operation: the one place the four boundaries are put in order.
 *
 * ADR-015's shape, stated as code. Claim one attempt durably; call the coach
 * **outside** any transaction; persist the validated proposal; then create
 * memory candidates in a separate transaction whose failure leaves the roadmap
 * valid. The coach call cannot be inside a database transaction — it holds
 * locks across an external deadline and cannot be made atomic with Postgres —
 * and a unique proposal row alone would not stop two serverless instances both
 * calling before either tried to insert.
 *
 * The claim is what closes that race, and it is also what makes an uncertain
 * retry cheap: the same key returns the existing claim, and only the caller
 * whose insert opened the attempt — the one holding `claimed` — calls the coach
 * at all. Every other state stops here.
 *
 * M3-11 deleted `roadmap-service.ts`, which held this sequence against four
 * injected legacy repositories. This is not that file restored. The context
 * now comes from M3-15D's `OwnedRecordsCoachAIContextSource`, which the
 * composition root supplies, so nothing here reads goals, memory, completions
 * or the plan in order to build a request — and nothing here could, because it
 * is handed no repository that would let it.
 *
 * ## Which coach answers
 *
 * Whichever `createRoadmapCoachAIService` resolves, which without
 * `FITTIP_AI_LIVE=enabled` and an approved runtime is `FixtureCoachAI`. This
 * module does not read that flag, does not pass an environment, and has no
 * branch on the answer: it records whatever provider and model the resolved
 * binding names, and `roadmap_technical_codes_are_accepted` refuses the pairing
 * at the database if it is not one somebody approved. A fixture result is
 * recorded as `fixture` and is labelled an example wherever it is shown.
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
  | { status: "failed" };

export type RoadmapGenerationDependencies = {
  roadmaps: RoadmapRepository;
};

/**
 * The reduced form of the previous proposal that travels on a regeneration.
 *
 * ADR-014 decision 2a says only the immediately previous proposal travels,
 * never the chain. It does not say the whole envelope must: a v2 proposal is
 * capped at 16,000 bytes against a 2,200-byte allocation for this source, so
 * sending one verbatim would leave nothing for the goals, memory and history
 * that make the critique meaningful. What the coach needs in order to act on
 * feedback is the shape it produced — the title, the summary, and each phase's
 * focus and dates.
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
  const { roadmaps } = deps;

  // The predecessor is read before the claim, because a regeneration that
  // cannot find its predecessor should fail before it consumes a key.
  let previousProposal: CoachAIPreviousProposalReference | null = null;
  if (input.previousProposalId !== null) {
    const previous = await roadmaps.getProposal(input.previousProposalId);
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

  const claim: RoadmapGenerationClaim = await roadmaps.beginGeneration({
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    startDate: input.startDate,
    endDate: input.endDate,
    expectedHeadRevision: input.expectedHeadRevision,
    planningNote: input.planningNote,
    previousProposalId: input.previousProposalId,
    regenerationFeedback: input.regenerationFeedback,
  });

  // An uncertain same-key retry stops here. Only `claimed` — the state the
  // database returns to the caller whose insert opened the attempt — continues
  // to the coach; anything else is a replay and must not buy a second call.
  //
  // M3-15F is also what made `pending` reachable from a genuinely concurrent
  // caller rather than only from a sequential retry: before the migration that
  // caller received an unmapped unique violation instead. It is still reported
  // as pending rather than retried, because the coach may already have
  // answered — and, on a live binding, already have been paid.
  if (claim.state !== "claimed") {
    if (claim.state === "completed" && claim.proposalId !== null) {
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
  const { service, binding } = createRoadmapCoachAIService({
    owner: input.owner,
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
    // pending attempt they cannot clear. The code comes from a fixed enum; no
    // provider text, prompt, or raw error reaches the database.
    const code =
      error instanceof CoachAIError ? error.code : "provider_unavailable";
    await roadmaps
      .finishGenerationAsFailed(claim.completionToken, code)
      .catch(() => {
        // A failed close leaves an honest pending attempt. It is never
        // automatically retried, and it must not replace the original cause.
      });
    throw error;
  }

  const proposalId = await roadmaps.finishGenerationWithProposal({
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

  return {
    status: "proposal",
    proposalId,
    memoryCandidateCount: await recordMemoryCandidates(
      roadmaps,
      claim.completionToken,
      input.startDate,
      outcome.memoryCandidates,
    ),
  };
}

/**
 * The candidate batch, in its own transaction after the roadmap has committed.
 *
 * Its failure is swallowed on purpose: one memory conflict must not roll back a
 * valid roadmap, which is the boundary ADR-015 draws and the alternative it
 * explicitly rejected. The count is what the roadmap surface reports; zero here
 * means "none were created", not "none were proposed", and the memory surface
 * is where a candidate is actually decided either way.
 */
async function recordMemoryCandidates(
  roadmaps: RoadmapRepository,
  completionToken: string,
  today: string,
  candidates: readonly { memoryType: string; sourceExcerpt: string }[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  try {
    const memory = await (await createMemoryRepository()).list(today);
    const receipt = await roadmaps.recordMemoryCandidates({
      completionToken,
      expectedMemoryRevision: memory.revision,
      candidates: candidates as Parameters<
        RoadmapRepository["recordMemoryCandidates"]
      >[0]["candidates"],
    });
    return receipt.itemIds.length;
  } catch {
    return 0;
  }
}
