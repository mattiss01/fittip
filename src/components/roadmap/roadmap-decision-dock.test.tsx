import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoadmapProposalReview } from "./roadmap-proposal-review";

import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import type { RoadmapProposalView } from "@/server/roadmap/roadmap-records";

/**
 * A refusal belongs to the proposal it was about.
 *
 * Accept refuses on a stale head, and an edit then replaces the open proposal
 * under the dock without removing it. The refusal the owner was looking at
 * describes a proposal that is no longer on screen, so it must not survive into
 * the one that replaced it — and the key on the dock is what ends it.
 *
 * The Server Actions are replaced here because the subject is what the dock
 * does with a reply, not what the server decides.
 */

const CONFLICT = "Your training history changed. Review the proposal again.";
const FIRST = "7e150000-0000-4000-8000-000000000020";
const SECOND = "7e150000-0000-4000-8000-000000000021";

vi.mock("@/app/home/plan/roadmap/actions", () => ({
  acceptRoadmapAction: (previous: RoadmapActionState) =>
    Promise.resolve({
      status: "conflict" as const,
      message: CONFLICT,
      submission: previous.submission + 1,
    }),
  declineRoadmapAction: (previous: RoadmapActionState) =>
    Promise.resolve({
      status: "declined" as const,
      message: "Declined. It stays in your history.",
      submission: previous.submission + 1,
    }),
  editRoadmapAction: (previous: RoadmapActionState) =>
    Promise.resolve({
      status: "edited" as const,
      message: "Saved as a new proposal. Review it below.",
      submission: previous.submission + 1,
    }),
}));

describe("RoadmapDecisionDock", () => {
  afterEach(cleanup);

  it("drops a refusal when the proposal under it is replaced", async () => {
    const { rerender } = render(review(FIRST));

    await refuseAccept();
    expect(screen.getByText(CONFLICT)).toBeTruthy();

    // What an edit produces: a different proposal at the same position.
    rerender(review(SECOND));

    expect(screen.queryByText(CONFLICT)).toBeNull();
    expect(
      screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.acceptAction }),
    ).toBeTruthy();
  });

  it("keeps a refusal while its own proposal is still the open one", async () => {
    const { rerender } = render(review(FIRST));

    await refuseAccept();
    // The surface re-renders for reasons that are not a new proposal; the thing
    // the owner has to act on must not disappear with one of them.
    rerender(review(FIRST, 4));

    expect(screen.getByText(CONFLICT)).toBeTruthy();
  });
});

async function refuseAccept() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.acceptAction }),
    );
  });
}

function review(id: string, expectedHeadRevision = 3) {
  return (
    <RoadmapProposalReview
      proposal={proposal(id)}
      expectedHeadRevision={expectedHeadRevision}
      goalTitles={{}}
    />
  );
}

function proposal(id: string): RoadmapProposalView {
  return {
    id,
    origin: "ai_initial",
    sourceProposalId: null,
    providerCode: "fixture",
    content: {
      schemaVersion: "fittip.roadmap.v2",
      title: "Base and build.",
      summary: "Twelve weeks of aerobic work before any sharpening.",
      startDate: "2026-09-14",
      endDate: "2026-12-06",
      phases: [],
      assumptions: [],
      uncertainties: [],
      reviewPoints: [],
    } as unknown as RoadmapProposalView["content"],
    planningNote: null,
    regenerationFeedback: null,
    regenerationNumber: 0,
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    decision: null,
    createdAt: "2026-09-14T09:00:00.000Z",
  };
}
