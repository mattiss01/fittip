import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCompletionHistoryMock,
  getPlannedSessionSnapshotMock,
  getPlanVersionSnapshotMock,
  listCurrentCompletionsMock,
  redirectMock,
} = vi.hoisted(() => ({
  getCompletionHistoryMock: vi.fn(),
  getPlannedSessionSnapshotMock: vi.fn(),
  getPlanVersionSnapshotMock: vi.fn(),
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
    getPlanVersionSnapshot = getPlanVersionSnapshotMock;
  },
}));
vi.mock("@/server/repositories/completion-repository", () => ({
  CompletionAuthenticationError: class extends Error {},
  CompletionRepository: class {
    getCompletionHistory = getCompletionHistoryMock;
    getPlannedSessionSnapshot = getPlannedSessionSnapshotMock;
    listCurrentCompletions = listCurrentCompletionsMock;
  },
}));

import ProgressDetailPage from "./page";

const GROUP_ID = "30000000-0000-4000-8000-000000000001";
const PLAN_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";

describe("ProgressDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("separates the source plan, current actual, and prior correction", async () => {
    const current = revision(2, "partially_completed", "Adjusted duration");
    const prior = revision(1, "completed");
    getCompletionHistoryMock.mockResolvedValue({
      current,
      revisions: [current, prior],
    });
    getPlannedSessionSnapshotMock.mockResolvedValue({
      id: SESSION_ID,
      localDate: "2026-07-29",
      title: "Easy run",
      sport: "Running",
      intent: "Keep it easy",
      expectedDurationMinutes: 40,
      activities: [],
    });

    render(
      await ProgressDetailPage({
        params: Promise.resolve({ id: `completion-${GROUP_ID}` }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Easy run" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Partially completed" }),
    ).toBeVisible();
    expect(screen.getByText("Preserved prior fact")).toBeVisible();
    expect(screen.getByText(/Adjusted duration/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Correct actual" }),
    ).toHaveAttribute("href", `/home/log?completion=${GROUP_ID}`);
  });

  it("navigates an immutable plan version and does not infer an actual", async () => {
    getPlanVersionSnapshotMock.mockResolvedValue({
      version: {
        id: PLAN_ID,
        versionNumber: 2,
        startDate: "2026-07-29",
        endDate: "2026-07-29",
        timezoneName: "Europe/Berlin",
        dayCount: 1,
      },
      sessions: [
        {
          id: SESSION_ID,
          localDate: "2026-07-29",
          position: 0,
          title: "Easy run",
          sport: "Running",
          intent: null,
          expectedDurationMinutes: 40,
          note: null,
          activities: [],
        },
      ],
    });
    listCurrentCompletionsMock.mockResolvedValue([]);

    render(
      await ProgressDetailPage({
        params: Promise.resolve({ id: `plan-${PLAN_ID}` }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Plan version 2." }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Not logged" })).toBeVisible();
    expect(
      screen.getByText("Time passing does not mark this session complete."),
    ).toBeVisible();
  });
});

function revision(
  revisionNumber: number,
  status: string,
  correctionReason?: string,
) {
  return {
    id: `40000000-0000-4000-8000-00000000000${revisionNumber}`,
    userId: "50000000-0000-4000-8000-000000000001",
    completionGroupId: GROUP_ID,
    revisionNumber,
    previousCompletionId: null,
    plannedSessionId: SESSION_ID,
    actualLocalDate: "2026-07-29",
    timezoneName: "Europe/Berlin",
    durationMinutes: 35,
    status,
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    correctionReason,
    createdAt: `2026-07-29T0${revisionNumber}:00:00.000Z`,
    activities: [],
  };
}
