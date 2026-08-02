import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRankPreview,
  isActionErrorStatus,
  OnboardingActionNotice,
  OnboardingManager,
} from "./onboarding-manager";
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
                existingStatus: null,
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
                existingStatus: null,
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

  it("previews only accepted create and update decisions", () => {
    const snapshot = emptySnapshot();
    snapshot.activeGoalOrder = [
      {
        id: "54000000-0000-4000-8000-000000000201",
        title: "Existing core",
        priorityTier: "core",
        activeRank: 1,
      },
    ];
    snapshot.goalCandidates = [
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000301",
        title: "Rejected candidate",
        decision: "rejected",
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000302",
        title: "Kept exact",
        decision: "accepted",
        resolution: "keep",
        targetGoalId: "54000000-0000-4000-8000-000000000201",
        comparison: {
          kind: "exact",
          targetId: "54000000-0000-4000-8000-000000000201",
          existingLabel: "Existing core",
          existingDetail: "Existing outcome",
          existingStatus: null,
        },
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000303",
        title: "Accepted new",
        decision: "accepted",
        resolution: "create",
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000304",
        title: "Accepted replacement",
        decision: "accepted",
        resolution: "update",
        targetGoalId: "54000000-0000-4000-8000-000000000201",
        comparison: {
          kind: "conflict",
          targetId: "54000000-0000-4000-8000-000000000201",
          existingLabel: "Existing core",
          existingDetail: "Existing outcome",
          existingStatus: null,
        },
      }),
    ];

    expect(buildRankPreview(snapshot).map((goal) => goal.title)).toEqual([
      "Accepted new",
      "Accepted replacement",
    ]);
  });

  it("surfaces inactive exact Memory and does not offer keep", () => {
    render(
      <OnboardingManager
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 6 }),
          memoryCandidates: [
            {
              id: "54000000-0000-4000-8000-000000000401",
              position: 1,
              fieldKey: "preference:1",
              memoryType: "preference",
              content: "Synthetic preference.",
              decision: "pending",
              resolution: null,
              targetMemoryId: null,
              comparison: {
                kind: "conflict",
                targetId: "54000000-0000-4000-8000-000000000402",
                existingLabel: "preference",
                existingDetail: "Synthetic preference.",
                existingStatus: "archived",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Saved status: archived/)).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /Keep what/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Update what/ }),
    ).toBeInTheDocument();
  });

  it("focuses the actionable error notice", async () => {
    render(
      <OnboardingActionNotice
        state={{
          status: "validation",
          message: "Review this step.",
          submission: 1,
        }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(isActionErrorStatus("validation")).toBe(true);
    expect(isActionErrorStatus("conflict")).toBe(true);
    expect(isActionErrorStatus("session")).toBe(true);
    expect(isActionErrorStatus("error")).toBe(true);
    expect(isActionErrorStatus("saved")).toBe(false);
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

function goalCandidate(
  overrides: Partial<OnboardingSnapshot["goalCandidates"][number]>,
): OnboardingSnapshot["goalCandidates"][number] {
  return {
    id: "54000000-0000-4000-8000-000000000399",
    position: 1,
    title: "Candidate",
    desiredOutcome: "Candidate outcome",
    category: "other",
    activityAreas: [],
    startDate: "2026-08-02",
    priorityTier: "core",
    targetRank: 2,
    decision: "pending",
    resolution: null,
    targetGoalId: null,
    comparison: {
      kind: "new",
      targetId: null,
      existingLabel: null,
      existingDetail: null,
      existingStatus: null,
    },
    ...overrides,
  };
}
