import type { FillProposal } from "./fill-state";

import { isExampleProposal } from "@/lib/plan/plan-proposal-view";
import { toActivityValue } from "@/lib/training/activity-value";
import type { SessionActivityProposalView } from "@/server/repositories/session-activity-repository";

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
