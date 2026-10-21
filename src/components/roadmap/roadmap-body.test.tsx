import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoadmapBody } from "@/components/roadmap/roadmap-body";
import type { RoadmapProposal } from "@/server/ai/contracts";
import type { LegacyRoadmapV2 } from "@/test/legacy-roadmap";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

const GOAL_ID = "7e160000-0000-4000-8000-000000000001";

/**
 * ADR-027. A roadmap is its spine: phases, each followed by the review the
 * app asks for as it ends. What a row stored under an earlier version also
 * holds is neither read nor shown.
 */
describe("RoadmapBody", () => {
  afterEach(cleanup);

  it("shows a roadmap as its phases, each followed by a review on its last day", () => {
    const { container } = renderBody(roadmap());

    expect(
      screen.getByRole("heading", { name: "Base and build" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Easy volume, one longer run a week."),
    ).toBeTruthy();
    expect(screen.getAllByText("Half marathon")).toHaveLength(2);
    expect(screen.getByText("Ninety minutes easy")).toBeTruthy();

    const reviews = [...container.querySelectorAll("[data-roadmap-review]")];
    expect(reviews.map((review) => review.textContent)).toEqual([
      `${ROADMAP_COPY.reviewOnDate("25 Oct 2026")}${ROADMAP_COPY.reviewAfterPhase(1)}`,
      `${ROADMAP_COPY.reviewOnDate("6 Dec 2026")}${ROADMAP_COPY.reviewAfterRoadmap}`,
    ]);
    // A proposal's reviews are neither due nor done.
    expect(
      reviews.map((review) => review.getAttribute("data-roadmap-review")),
    ).toEqual(["ahead", "ahead"]);
  });

  it("says which review is due and which are done, on the roadmap in force", () => {
    const { container } = renderBody(roadmap(), {
      duePhaseIndex: 1,
      reviewedThrough: 0,
    });

    const reviews = [...container.querySelectorAll("[data-roadmap-review]")];
    expect(
      reviews.map((review) => review.getAttribute("data-roadmap-review")),
    ).toEqual(["done", "due"]);
    expect(reviews[0]).toHaveTextContent(ROADMAP_COPY.reviewDone);
    expect(reviews[1]).toHaveTextContent(
      ROADMAP_COPY.reviewDueSince("6 Dec 2026"),
    );
  });

  it("shows a phase with no milestone without an empty list", () => {
    const content = roadmap();
    content.phases[0].milestones = [];
    const { container } = renderBody(content);

    expect(screen.queryByText("Ninety minutes easy")).toBeNull();
    // The attention list is that phase's only list.
    expect(container.querySelectorAll("ol > li:first-child ul")).toHaveLength(
      1,
    );
  });

  it("shows a phase only the goals it works on, not those kept up or put off", () => {
    const content = roadmap();
    content.phases[1].goalAttention = [
      { goalId: GOAL_ID, level: "maintenance" },
    ];
    content.phases[0].goalAttention = [{ goalId: GOAL_ID, level: "deferred" }];
    const { container } = renderBody(content);

    expect(screen.queryByText("Half marathon")).toBeNull();
    // No empty goal list: the first phase keeps its milestones list, the
    // second, with no milestone, has no list at all.
    expect(container.querySelectorAll("ol ul")).toHaveLength(1);
  });

  it("shows nothing of what a row stored under an earlier version also holds", () => {
    renderBody(legacyRoadmap());

    for (const gone of [
      "Four training days stay available.",
      "The taper hangs off it.",
      "Load on the knee stays flat.",
      "The only dated target in range.",
      "Is the long run still comfortable?",
      "Check the base",
    ]) {
      expect(screen.queryByText(gone), gone).toBeNull();
    }
  });
});

function renderBody(
  content: RoadmapProposal | LegacyRoadmapV2,
  review?: { duePhaseIndex: number | null; reviewedThrough: number | null },
) {
  return render(
    <RoadmapBody
      content={content}
      {...(review === undefined ? {} : { review })}
      startDate={content.startDate}
      endDate={content.endDate}
      providerCode="openai"
      goalTitles={{ [GOAL_ID]: "Half marathon" }}
    />,
  );
}

function roadmap(): RoadmapProposal {
  return {
    schemaVersion: "fittip.roadmap.v4",
    title: "Base and build",
    summary: "Twelve weeks of aerobic work before any sharpening.",
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    phases: [
      {
        title: "Aerobic base",
        focus: "Easy volume, one longer run a week.",
        startDate: "2026-09-14",
        endDate: "2026-10-25",
        goalAttention: [{ goalId: GOAL_ID, level: "primary" }],
        milestones: [
          {
            title: "Ninety minutes easy",
            observableCriterion:
              "One run of 90 minutes at conversational pace.",
            targetDate: "2026-10-20",
            goalIds: [GOAL_ID],
          },
        ],
      },
      {
        title: "Sharpen",
        focus: "Less volume, some running at race effort.",
        startDate: "2026-10-26",
        endDate: "2026-12-06",
        goalAttention: [{ goalId: GOAL_ID, level: "primary" }],
        milestones: [],
      },
    ],
  };
}

function legacyRoadmap(): LegacyRoadmapV2 {
  const current = roadmap();
  return {
    ...current,
    schemaVersion: "fittip.roadmap.v2",
    phases: current.phases.map((phase) => ({
      ...phase,
      goalAttention: phase.goalAttention.map((attention) => ({
        ...attention,
        reason: "The only dated target in range.",
      })),
    })),
    assumptions: ["Four training days stay available."],
    uncertainties: [
      {
        statement: "The race date is not confirmed.",
        whyItMatters: "The taper hangs off it.",
        whatToWatch: "Confirm the entry before the last phase.",
      },
    ],
    safetyConsiderations: ["Load on the knee stays flat."],
    reviewPoints: [
      {
        title: "Check the base",
        triggerDate: "2026-10-25",
        question: "Is the long run still comfortable?",
      },
    ],
  };
}
