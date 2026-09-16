import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoadmapProposalRecord } from "@/components/roadmap/roadmap-proposal-record";
import {
  ROADMAP_COPY,
  type RoadmapProposalView,
} from "@/server/roadmap/roadmap-records";

const OPEN_PROPOSAL = "7e150000-0000-4000-8000-000000000010";
const EARLIER_PROPOSAL = "7e150000-0000-4000-8000-000000000011";

describe("RoadmapProposalRecord", () => {
  afterEach(cleanup);

  // The record is the open proposal's line in the history, not a second place
  // to decide it. M3-15F puts the controls on `RoadmapProposalReview` above,
  // which shows the proposal in full; a second accept button here would be a
  // second answer to where a decision is made.
  it("shows the open proposal as a record and offers no control", () => {
    renderRecord(proposal(OPEN_PROPOSAL), OPEN_PROPOSAL);

    const record = recordFor(OPEN_PROPOSAL);
    expect(record.getAttribute("data-roadmap-proposal-state")).toBe("open");
    expect(screen.getByText("Awaiting your decision")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(record.querySelector("form")).toBeNull();
  });

  // The label rests on the stored provider code alone. `origin` says how a
  // proposal came about, not who wrote it.
  it("labels a fixture-authored proposal an example and a coach-authored one not", () => {
    renderRecord(proposal(OPEN_PROPOSAL), OPEN_PROPOSAL);
    expect(screen.getByText(ROADMAP_COPY.exampleLabel)).toBeTruthy();

    cleanup();
    renderRecord(
      { ...proposal(OPEN_PROPOSAL), providerCode: "openai" },
      OPEN_PROPOSAL,
    );
    expect(screen.queryByText(ROADMAP_COPY.exampleLabel)).toBeNull();
  });

  // An owner edit supersedes its source without deciding it, so the source is
  // undecided and still not the proposal awaiting a decision. Labelling both
  // "Awaiting your decision" would put two waiting records on screen, one of
  // which nothing will ever decide.
  it("shows an undecided proposal that is not the open one as superseded", () => {
    renderRecord(proposal(EARLIER_PROPOSAL), OPEN_PROPOSAL);

    const record = recordFor(EARLIER_PROPOSAL);
    expect(record.getAttribute("data-roadmap-proposal-state")).toBe(
      "superseded",
    );
    expect(screen.getByText("Superseded")).toBeTruthy();
    expect(screen.getByText(ROADMAP_COPY.proposalSuperseded)).toBeTruthy();
    expect(screen.queryByText("Awaiting your decision")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(record.querySelector("form")).toBeNull();
  });

  it("shows an undecided proposal as superseded when nothing is open", () => {
    renderRecord(proposal(EARLIER_PROPOSAL), null);

    expect(
      recordFor(EARLIER_PROPOSAL).getAttribute("data-roadmap-proposal-state"),
    ).toBe("superseded");
    expect(screen.queryByText("Awaiting your decision")).toBeNull();
  });

  it("keeps a decided proposal's own state whatever is open", () => {
    renderRecord(
      { ...proposal(EARLIER_PROPOSAL), decision: "expired" },
      OPEN_PROPOSAL,
    );

    expect(
      recordFor(EARLIER_PROPOSAL).getAttribute("data-roadmap-proposal-state"),
    ).toBe("expired");
    expect(screen.getByText(ROADMAP_COPY.proposalExpired)).toBeTruthy();
  });
});

function renderRecord(
  record: RoadmapProposalView,
  openProposalId: string | null,
) {
  render(
    <ul>
      <RoadmapProposalRecord
        proposal={record}
        openProposalId={openProposalId}
      />
    </ul>,
  );
}

function recordFor(id: string): HTMLElement {
  return document.querySelector(
    `[data-roadmap-proposal="${id}"]`,
  ) as HTMLElement;
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
