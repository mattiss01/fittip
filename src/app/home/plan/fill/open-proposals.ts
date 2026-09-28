import "server-only";

import type { FillProposal } from "./fill-state";

import { isExampleProposal } from "@/lib/plan/plan-proposal-view";
import { toActivityValue } from "@/lib/training/activity-value";
import {
  createSessionActivityRepository,
  type SessionActivityProposalView,
} from "@/server/repositories/session-activity-repository";

/** A stored proposal, as the session editor's suggestion box shows it. */
export function toFillProposal(
  proposal: SessionActivityProposalView,
): FillProposal {
  return {
    proposalId: proposal.id,
    isExample: isExampleProposal(proposal.providerCode),
    summary: proposal.content.summary,
    safetyConsiderations: proposal.content.safetyConsiderations ?? [],
    activities: proposal.content.activities.map(toActivityValue),
    rationales: proposal.content.activities.map(
      (activity) => activity.rationale,
    ),
  };
}

/**
 * Each session's newest undecided suggestion, by session id, so a suggestion
 * the owner saved past or closed unanswered is back when they open the session
 * again (owner, 28 Sep 2026).
 *
 * A failed read shows no suggestions rather than failing the Plan: nothing is
 * lost, since the suggestion stays stored and undecided, and the Plan is the
 * surface the owner needs most.
 */
export async function readOpenFillProposals(
  sessionIds: readonly string[],
): Promise<Map<string, FillProposal>> {
  try {
    const repository = await createSessionActivityRepository();
    const open = await repository.listOpenProposals(sessionIds);
    return new Map(
      open.flatMap((proposal) =>
        proposal.sessionId === null
          ? []
          : [[proposal.sessionId, toFillProposal(proposal)] as const],
      ),
    );
  } catch {
    return new Map();
  }
}
