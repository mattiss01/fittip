import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/home/log/actions", () => ({
  saveQuickLog: vi.fn(),
}));

import { QuickLogForm } from "@/components/completions/quick-log-form";

afterEach(cleanup);

const PLANNED = {
  id: "00000000-0000-4000-8000-000000000010",
  localDate: "2026-07-28",
  title: "Aerobic run",
  sport: "Running",
  intent: "Easy volume",
  expectedDurationMinutes: 45,
  activities: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      name: "Easy run",
      sport: "Running",
      instructions: null,
      measurementMode: "time_distance_pace" as const,
    },
  ],
};

describe("QuickLogForm", () => {
  it("offers one touch-friendly planned-outcome form with honest optional fields", () => {
    render(
      <QuickLogForm
        current={null}
        defaultDate="2026-07-28"
        plannedSession={PLANNED}
      />,
    );

    expect(screen.getByRole("radio", { name: "Completed" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Unplanned" })).toBeDisabled();
    expect(screen.getByLabelText("Local date *")).toHaveValue("2026-07-28");
    expect(screen.getByLabelText("Perceived effort (1–10)")).toHaveAttribute(
      "max",
      "10",
    );
    expect(
      screen.getByRole("button", { name: "Save actual" }),
    ).toBeInTheDocument();
  });

  it("reveals and requires replacement description only for replacement", () => {
    render(
      <QuickLogForm
        current={null}
        defaultDate="2026-07-28"
        plannedSession={PLANNED}
      />,
    );
    expect(
      screen.queryByLabelText("What replaced it? *"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Replaced" }));
    expect(screen.getByLabelText("What replaced it? *")).toBeRequired();
  });

  it("restricts a no-plan flow to the truthful unplanned outcome", () => {
    render(
      <QuickLogForm
        current={null}
        defaultDate="2026-07-28"
        plannedSession={null}
      />,
    );
    expect(screen.getByRole("radio", { name: "Unplanned" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Completed" })).toBeDisabled();
  });

  it("shows correction reason and immutable-history copy on a correction", () => {
    render(
      <QuickLogForm
        current={{
          id: "00000000-0000-4000-8000-000000000050",
          userId: "00000000-0000-4000-8000-000000000001",
          completionGroupId: "00000000-0000-4000-8000-000000000060",
          revisionNumber: 1,
          previousCompletionId: null,
          plannedSessionId: PLANNED.id,
          actualLocalDate: "2026-07-28",
          timezoneName: "Europe/Berlin",
          status: "completed",
          painReported: false,
          illnessReported: false,
          injuryReported: false,
          severeFatigueReported: false,
          createdAt: "2026-07-28T12:00:00Z",
          activities: [],
        }}
        defaultDate="2026-07-28"
        plannedSession={PLANNED}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: /Reason for correction/ }),
    ).toBeRequired();
    expect(
      screen.getByText("The prior revision remains visible and unchanged."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save correction" }),
    ).toBeInTheDocument();
  });
});
