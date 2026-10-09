// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FinishedProposal } from "./finished-proposal";

import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import type { PlanProposalItemView } from "@/lib/plan/plan-proposal-view";
import type { PlanProposalView } from "@/server/plan-proposal/plan-proposal-records";

const COPY = PLAN_PROPOSAL_COPY;

function item(
  ordinal: number,
  decision: PlanProposalItemView["decision"],
  title: string,
): PlanProposalItemView {
  return {
    ordinal,
    kind: "session",
    localDate: "2026-10-09",
    decision,
    title,
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 45,
    rationale: null,
    contentIndex: ordinal,
    replacesSessionId: null,
  };
}

function proposal(): PlanProposalView {
  return {
    id: "9c000000-0000-4000-8000-000000000001",
    providerCode: "openai",
    planningNote: null,
    regenerationFeedback: null,
    content: {} as PlanProposalView["content"],
    startDate: "2026-10-09",
    endDate: "2026-10-11",
    composedAtPlanRevision: 4,
    generationId: "9c000000-0000-4000-8000-000000000002",
    items: [
      item(0, "staged", "Easy run"),
      item(1, "staged_beside", "Tempo run"),
      item(2, "rejected", "Hill repeats"),
    ],
    decision: "applied",
    decidedAt: "2026-10-09T10:00:00.000Z",
    createdAt: "2026-10-09T09:00:00.000Z",
  };
}

describe("the last finished review", () => {
  afterEach(cleanup);

  it("is one line that says what happened, with the items folded under it", () => {
    render(<FinishedProposal proposal={proposal()} justFinished={false} />);

    const summary = screen.getByText(COPY.lastReviewSummary("Fri 9 Oct", 2, 1));
    expect(summary.closest("details")).not.toHaveAttribute("open");
    // Past tense: nothing here is still waiting to happen.
    expect(screen.getAllByText(COPY.addedBadge)).toHaveLength(2);
    expect(screen.queryByText(COPY.stagedBadge)).toBeNull();
    expect(screen.queryByText(COPY.proposedBadge)).toBeNull();
    // The sentence and the link belong to the moment after a finish.
    expect(screen.queryByText(COPY.outcomes.applied(2))).toBeNull();
    expect(
      screen.queryByRole("link", { name: COPY.finishedPlanLink }),
    ).toBeNull();
  });

  it("answers a finish made a moment ago with the sentence and the way back", () => {
    render(<FinishedProposal proposal={proposal()} justFinished />);

    expect(screen.getByText(COPY.outcomes.applied(2))).toBeVisible();
    expect(
      screen.getByRole("link", { name: COPY.finishedPlanLink }),
    ).toHaveAttribute("href", "/home/plan");
  });
});
