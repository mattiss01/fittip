import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnboardingManager } from "./onboarding-manager";
import type { OnboardingSnapshot } from "@/lib/onboarding/onboarding-contract";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("OnboardingManager", () => {
  it("explains storage and no-AI behavior before creating a draft", () => {
    render(<OnboardingManager snapshot={emptySnapshot()} />);

    expect(
      screen.getByRole("heading", {
        name: "Set up your coaching context.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/stored in your account so you can resume/),
    ).toBeVisible();
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start setup" })).toBeVisible();
  });

  it("renders six textual steps and keeps later steps unavailable", () => {
    render(
      <OnboardingManager
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 2 }),
        }}
      />,
    );

    expect(screen.getByText("Step 2 of 6 · Current training")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /3Time and access/ }),
    ).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("shows the approved safety copy without a severity control", () => {
    render(
      <OnboardingManager
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 5 }),
        }}
      />,
    );

    expect(
      screen.getByText(
        /FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, or getting worse/,
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText(/severity/i)).not.toBeInTheDocument();
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
  });

  it("stamps every review card with its permanent destination", () => {
    const goalId = "54000000-0000-4000-8000-000000000101";
    const memoryId = "54000000-0000-4000-8000-000000000102";
    render(
      <OnboardingManager
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 6 }),
          goalCandidates: [
            {
              id: goalId,
              position: 1,
              title: "Finish a calm 10K",
              desiredOutcome: "Run with even pacing.",
              category: "performance_event",
              activityAreas: ["Running"],
              startDate: "2026-08-02",
              priorityTier: "core",
              targetRank: 1,
              decision: "pending",
              resolution: null,
              targetGoalId: null,
              comparison: {
                kind: "new",
                targetId: null,
                existingLabel: null,
                existingDetail: null,
              },
            },
          ],
          memoryCandidates: [
            {
              id: memoryId,
              position: 1,
              fieldKey: "context:units",
              memoryType: "preference",
              content: "Units: Metric.",
              decision: "pending",
              resolution: null,
              targetMemoryId: null,
              comparison: {
                kind: "new",
                targetId: null,
                existingLabel: null,
                existingDetail: null,
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Choose where each statement lands.",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Memory").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox", { name: "Decision" })).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: "Save accepted items" }),
    ).toBeVisible();
  });
});

function emptySnapshot(): OnboardingSnapshot {
  return {
    draft: null,
    activities: [],
    goalCandidates: [],
    memoryCandidates: [],
    goalRevision: 0,
    memoryRevision: 0,
    activeGoalOrder: [],
    promptDismissed: false,
    hasPublished: false,
  };
}

function draft(
  overrides: Partial<NonNullable<OnboardingSnapshot["draft"]>>,
): NonNullable<OnboardingSnapshot["draft"]> {
  return {
    id: "54000000-0000-4000-8000-000000000001",
    revision: 0,
    currentStep: 1,
    trainingStatus: null,
    availableDays: [],
    sessionsPerWeek: null,
    sessionDurationMinutes: null,
    accessLabels: [],
    timezoneName: "Europe/Berlin",
    units: "metric",
    idempotencyKey: "54000000-0000-4000-8000-000000000002",
    expiresAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}
