import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoadmapBody } from "@/components/roadmap/roadmap-body";
import type { LegacyRoadmapV2, RoadmapProposal } from "@/server/ai/contracts";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

const GOAL_ID = "7e160000-0000-4000-8000-000000000001";

/**
 * ADR-025. A v3 roadmap is its spine and nothing under it. One stored before
 * v3 is a permanent record and still reads as it was written.
 */
describe("RoadmapBody", () => {
  afterEach(cleanup);

  it("shows a v3 roadmap as phases and review points and nothing else", () => {
    renderBody(roadmap());

    expect(
      screen.getByRole("heading", { name: "Base and build" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Easy volume, one longer run a week."),
    ).toBeTruthy();
    expect(screen.getByText("primary · Half marathon")).toBeTruthy();
    expect(screen.getByText("Ninety minutes easy")).toBeTruthy();
    expect(screen.getByText("Is the long run still comfortable?")).toBeTruthy();
    for (const heading of [
      ROADMAP_COPY.assumptionsHeading,
      ROADMAP_COPY.uncertaintiesHeading,
      ROADMAP_COPY.heldBackHeading,
    ]) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    }
  });

  it("shows a phase with no milestone without an empty list", () => {
    const content = roadmap();
    content.phases[0].milestones = [];
    const { container } = renderBody(content);

    expect(screen.queryByText(/Aim for by/)).toBeNull();
    // The attention list is the phase's only list.
    expect(container.querySelectorAll("ol li ul")).toHaveLength(1);
  });

  it("still shows what a roadmap stored before v3 holds", () => {
    renderBody(legacyRoadmap());

    expect(
      screen.getByRole("heading", { name: ROADMAP_COPY.assumptionsHeading }),
    ).toBeTruthy();
    expect(screen.getByText("Four training days stay available.")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: ROADMAP_COPY.uncertaintiesHeading }),
    ).toBeTruthy();
    expect(screen.getByText("The taper hangs off it.")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: ROADMAP_COPY.heldBackHeading }),
    ).toBeTruthy();
    expect(screen.getByText("Load on the knee stays flat.")).toBeTruthy();
    expect(screen.getByText("The only dated target in range.")).toBeTruthy();
  });
});

function renderBody(content: RoadmapProposal | LegacyRoadmapV2) {
  return render(
    <RoadmapBody
      content={content}
      meta="Version 1"
      providerCode="openai"
      goalTitles={{ [GOAL_ID]: "Half marathon" }}
    />,
  );
}

function roadmap(): RoadmapProposal {
  return {
    schemaVersion: "fittip.roadmap.v3",
    title: "Base and build",
    summary: "Twelve weeks of aerobic work before any sharpening.",
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    phases: [
      {
        title: "Aerobic base",
        focus: "Easy volume, one longer run a week.",
        startDate: "2026-09-14",
        endDate: "2026-12-06",
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
    ],
    reviewPoints: [
      {
        title: "Check the base",
        triggerDate: "2026-10-25",
        question: "Is the long run still comfortable?",
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
  };
}
