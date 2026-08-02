import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentPlanSnapshotMock,
  getEntryStateMock,
  listCurrentCompletionsMock,
  redirectMock,
} = vi.hoisted(() => ({
  getCurrentPlanSnapshotMock: vi.fn(),
  getEntryStateMock: vi.fn().mockResolvedValue({ showHomeInvitation: false }),
  listCurrentCompletionsMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/server/repositories/training-record-repository", () => ({
  TrainingRecordAuthenticationError: class extends Error {},
  TrainingRecordRepository: class {
    getCurrentPlanSnapshot = getCurrentPlanSnapshotMock;
  },
}));
vi.mock("@/server/repositories/completion-repository", () => ({
  CompletionAuthenticationError: class extends Error {},
  CompletionRepository: class {
    listCurrentCompletions = listCurrentCompletionsMock;
  },
}));
vi.mock("@/server/repositories/onboarding-repository", () => ({
  OnboardingAuthenticationError: class extends Error {},
  OnboardingRepository: class {
    getEntryState = getEntryStateMock;
  },
}));

import TodayPage from "./page";

const PLAN_ID = "10000000-0000-4000-8000-000000000001";
const FIRST_SESSION = "20000000-0000-4000-8000-000000000001";
const SECOND_SESSION = "20000000-0000-4000-8000-000000000002";
const GROUP_ID = "30000000-0000-4000-8000-000000000001";

describe("TodayPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves plan order and gives each session its factual action", async () => {
    getCurrentPlanSnapshotMock.mockResolvedValue({
      head: { currentVersionId: PLAN_ID },
      version: {
        id: PLAN_ID,
        versionNumber: 3,
        timezoneName: "Europe/Berlin",
      },
      sessions: [
        session(FIRST_SESSION, 0, "Easy run"),
        session(SECOND_SESSION, 1, "Mobility reset"),
      ],
    });
    listCurrentCompletionsMock.mockResolvedValue([
      completion({
        completionGroupId: GROUP_ID,
        plannedSessionId: SECOND_SESSION,
        status: "partially_completed",
      }),
      completion({
        completionGroupId: "30000000-0000-4000-8000-000000000002",
        status: "unplanned",
      }),
    ]);

    render(await TodayPage());

    const sessions = screen.getAllByRole("listitem");
    expect(sessions[0]).toHaveTextContent("Easy run");
    expect(sessions[1]).toHaveTextContent("Mobility reset");
    expect(screen.getByRole("link", { name: "Log training" })).toHaveAttribute(
      "href",
      `/home/log?plannedSession=${FIRST_SESSION}`,
    );
    expect(
      screen.getAllByRole("link", { name: "View actual" })[0],
    ).toHaveAttribute("href", `/home/progress/completion-${GROUP_ID}`);
    expect(screen.getAllByText("Partially completed").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole("heading", { name: "Unplanned actuals" }),
    ).toBeVisible();
  });

  it("offers one honest planning route when no plan exists", async () => {
    getCurrentPlanSnapshotMock.mockResolvedValue(null);
    listCurrentCompletionsMock.mockResolvedValue([]);

    render(await TodayPage());

    expect(
      screen.getByRole("heading", { name: "Start with the plan." }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Plan training" })).toHaveAttribute(
      "href",
      "/home/plan",
    );
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });
});

function session(id: string, position: number, title: string) {
  return {
    id,
    localDate: "2026-07-29",
    position,
    title,
    sport: position === 0 ? "Running" : "Mobility",
    intent: null,
    expectedDurationMinutes: 30,
    note: null,
    activities: [],
  };
}

function completion(
  overrides: Partial<{
    completionGroupId: string;
    plannedSessionId: string;
    status: string;
  }>,
) {
  return {
    id: crypto.randomUUID(),
    completionGroupId: overrides.completionGroupId ?? crypto.randomUUID(),
    plannedSessionId: overrides.plannedSessionId,
    actualLocalDate: "2026-07-29",
    timezoneName: "Europe/Berlin",
    status: overrides.status ?? "completed",
    revisionNumber: 1,
    createdAt: "2026-07-29T08:00:00.000Z",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    activities: [],
  };
}
