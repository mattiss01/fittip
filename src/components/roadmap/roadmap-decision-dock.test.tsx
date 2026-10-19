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
import type { MemorySuggestion } from "@/components/memory/memory-suggestions";
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
const GOAL = "7e150000-0000-4000-8000-000000000030";

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
      message: "Declined.",
      submission: previous.submission + 1,
    }),
  askAgainRoadmapAction: vi.fn(),
  writeRoadmapAction: vi.fn(),
  rewriteRoadmapAction: vi.fn(),
  editRoadmapAction: (previous: RoadmapActionState) =>
    Promise.resolve({
      status: "edited" as const,
      message: "Saved as a new proposal. Review it below.",
      submission: previous.submission + 1,
    }),
}));

vi.mock("@/app/home/you/memory/actions", () => ({
  changeMemoryAction: vi.fn(),
}));

describe("RoadmapDecisionDock", () => {
  afterEach(cleanup);

  it("puts open memory suggestions in front of the owner once before Accept (owner, 19 Oct 2026)", async () => {
    render(
      review(FIRST, 3, 3, true, [
        {
          id: "m1",
          proposalId: FIRST,
          memoryType: "constraint",
          content: "Weekdays are short.",
        },
      ]),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.acceptAction }),
      );
    });
    // Asked, not accepted yet.
    expect(
      screen.getByText(ROADMAP_CONTROL_COPY.memoryBeforeEndTitle),
    ).toBeTruthy();
    expect(screen.getByText("Weekdays are short.")).toBeTruthy();
    expect(screen.queryByText(CONFLICT)).toBeNull();

    // Going on from the question submits the accept it interrupted.
    const accepts = screen.getAllByRole("button", {
      name: ROADMAP_CONTROL_COPY.acceptAction,
    });
    await act(async () => {
      fireEvent.click(accepts[accepts.length - 1]);
    });
    expect(screen.getByText(CONFLICT)).toBeTruthy();
    expect(
      screen.queryByText(ROADMAP_CONTROL_COPY.memoryBeforeEndTitle),
    ).toBeNull();
  });

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

describe("what the dock shows (owner, 14 Oct 2026)", () => {
  afterEach(cleanup);

  // ADR-032: a proposal naming a goal no longer active is accepted as it is,
  // and says so before Accept.
  it("names a goal the proposal still names that is no longer active", () => {
    render(review(FIRST, 3, 3, false));
    expect(
      document.querySelector("[data-roadmap-inactive-goals]")?.textContent,
    ).toBe(
      "This roadmap names a goal no longer active: Half marathon. Accepting puts it in force as it is; you can edit it afterwards.",
    );
  });

  it("says nothing of goals while every one it names is active", () => {
    render(review(FIRST));
    expect(document.querySelector("[data-roadmap-inactive-goals]")).toBe(null);
  });

  it("shows the form and nothing of the proposal while it is edited", () => {
    render(review(FIRST));
    expect(screen.getByText("Base and build.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.editAction }),
    );

    expect(
      screen.getByRole("heading", { name: ROADMAP_CONTROL_COPY.editTitle }),
    ).toBeTruthy();
    expect(screen.queryByText("A proposal is waiting")).toBeNull();
    expect(
      screen.queryByRole("button", { name: ROADMAP_CONTROL_COPY.acceptAction }),
    ).toBeNull();
    // The form opens on the proposal, its dates fixed.
    expect(
      (screen.getAllByLabelText("Title")[0] as HTMLInputElement).value,
    ).toBe("Base and build.");

    fireEvent.click(
      screen.getByRole("button", {
        name: ROADMAP_CONTROL_COPY.editCancelAction,
      }),
    );
    expect(screen.getByText("Base and build.")).toBeTruthy();
  });

  it("asks what should change only after Ask for another is pressed", () => {
    render(review(FIRST));
    expect(
      screen.queryByLabelText(ROADMAP_CONTROL_COPY.askAgainLabel),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.askAgainAction }),
    );

    expect(
      screen.getByLabelText(ROADMAP_CONTROL_COPY.askAgainLabel),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: ROADMAP_CONTROL_COPY.askAgainConfirm,
      }),
    ).toBeTruthy();
    // The proposal stays readable above it.
    expect(screen.getByText("Base and build.")).toBeTruthy();
  });

  it("offers no Ask for another once the asks on these dates are used", () => {
    render(review(FIRST, 3, 0));

    expect(
      screen.queryByRole("button", {
        name: ROADMAP_CONTROL_COPY.askAgainAction,
      }),
    ).toBeNull();
  });
});

async function refuseAccept() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_CONTROL_COPY.acceptAction }),
    );
  });
}

function review(
  id: string,
  expectedHeadRevision = 3,
  regenerationsRemaining = 3,
  active = true,
  suggestions: MemorySuggestion[] = [],
) {
  return (
    <RoadmapProposalReview
      proposal={proposal(id)}
      expectedHeadRevision={expectedHeadRevision}
      goalTitles={active ? { [GOAL]: "Half marathon" } : {}}
      otherGoalTitles={active ? {} : { [GOAL]: "Half marathon" }}
      today="2026-09-14"
      regenerationsRemaining={regenerationsRemaining}
      memory={{ revision: 0, suggestions }}
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
      phases: [
        {
          title: "Aerobic base",
          focus: "Easy volume.",
          startDate: "2026-09-14",
          endDate: "2026-12-06",
          goalAttention: [{ goalId: GOAL, level: "primary" }],
          milestones: [],
        },
      ],
      assumptions: [],
      uncertainties: [],
      reviewPoints: [],
    } as unknown as RoadmapProposalView["content"],
    planningNote: null,
    regenerationFeedback: null,
    regenerationNumber: 0,
    changesRoadmap: false,
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    decision: null,
    createdAt: "2026-09-14T09:00:00.000Z",
  };
}
