import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanProposalDays } from "@/components/plan-proposal/plan-proposal-days";
import type { SevenDayPlanProposal } from "@/server/ai/contracts";

describe("plan proposal days", () => {
  it("renders every requested date and makes rest explicit", () => {
    render(
      <PlanProposalDays
        goalTitles={{ "a1000000-0000-4000-8000-000000000001": "Run 10k" }}
        proposal={proposal()}
      />,
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(
      screen.getByText("No session planned. This is an explicit rest day."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Primary · Run 10k")).toHaveLength(2);
    expect(
      screen.getAllByText("Focus, reasoning and alternatives"),
    ).toHaveLength(2);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

function proposal(): SevenDayPlanProposal {
  return {
    schemaVersion: "fittip.seven-day-plan.v2",
    weekDescription: "A short horizon with one training day and planned rest.",
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    sessions: [
      {
        date: "2026-08-12",
        title: "Easy aerobic session",
        sport: "Running",
        focus: "Easy rhythm",
        intent: "Finish fresh",
        durationMinutes: 40,
        primaryGoalId: "a1000000-0000-4000-8000-000000000001",
        rationale: "Build repeatable work.",
      },
      {
        date: "2026-08-14",
        title: "Mobility",
        sport: "Mobility",
        focus: "Comfortable range",
        intent: "Move without strain",
        durationMinutes: 20,
        primaryGoalId: "a1000000-0000-4000-8000-000000000001",
        rationale: "Support the primary goal without more load.",
      },
    ],
  };
}
