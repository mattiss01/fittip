import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRepositoryMock,
  createProfileMock,
  listMock,
  listChangesMock,
  redirectMock,
  GoalAuthenticationErrorMock,
} = vi.hoisted(() => {
  class GoalAuthenticationErrorMock extends Error {
    constructor(readonly accessError?: { reason?: string }) {
      super("Authentication required.");
    }
  }
  return {
    createRepositoryMock: vi.fn(),
    createProfileMock: vi.fn(),
    listMock: vi.fn(),
    listChangesMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
    GoalAuthenticationErrorMock,
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/repositories/goal-repository", () => ({
  createGoalRepository: createRepositoryMock,
  GoalAuthenticationError: GoalAuthenticationErrorMock,
}));
vi.mock("@/server/repositories/profile-repository", () => ({
  createProfileRepository: createProfileMock,
  ProfileAuthenticationError: class extends Error {},
}));
vi.mock("@/components/goals/goal-manager", () => ({
  GoalManager: ({
    expectedRevision,
    initialGoals,
  }: {
    expectedRevision: number;
    initialGoals: { id: string; statusDate?: string | null }[];
  }) => (
    <div>
      Goals revision {expectedRevision}, count {initialGoals.length}
      {initialGoals.map((goal) => (
        <span key={goal.id}>
          {goal.id} on {goal.statusDate ?? "no day"}
        </span>
      ))}
    </div>
  ),
}));

import GoalsPage from "./page";

describe("GoalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChangesMock.mockResolvedValue([]);
    createRepositoryMock.mockResolvedValue({
      list: listMock,
      listStatusChanges: listChangesMock,
    });
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ timezoneName: "Europe/Berlin" }),
    });
  });
  afterEach(cleanup);

  it("loads only the authenticated collection on the server", async () => {
    listMock.mockResolvedValue({
      revision: 3,
      goals: [{ id: "goal", status: "active", archivedAt: null }],
    });
    render(await GoalsPage());
    expect(screen.getByText(/Goals revision 3, count 1/)).toBeVisible();
    expect(listMock).toHaveBeenCalledOnce();
  });

  it("dates a goal by the day it entered its status, in the owner's zone", async () => {
    listMock.mockResolvedValue({
      revision: 3,
      goals: [
        { id: "achieved", status: "achieved", archivedAt: null },
        { id: "reopened", status: "active", archivedAt: null },
        { id: "unlogged", status: "abandoned", archivedAt: null },
      ],
    });
    listChangesMock.mockResolvedValue([
      // 22:30 UTC on the 1st is already the 2nd in Berlin.
      {
        goalId: "achieved",
        status: "achieved",
        changedAt: "2026-10-01T22:30:00.000Z",
      },
      // An active goal carries no day, whatever the log last said.
      {
        goalId: "reopened",
        status: "active",
        changedAt: "2026-10-01T10:00:00.000Z",
      },
      // A log entry for another status is not this status's day.
      {
        goalId: "unlogged",
        status: "paused",
        changedAt: "2026-09-01T10:00:00.000Z",
      },
    ]);

    render(await GoalsPage());

    expect(screen.getByText("achieved on 2026-10-02")).toBeVisible();
    expect(screen.getByText("reopened on no day")).toBeVisible();
    expect(screen.getByText("unlogged on no day")).toBeVisible();
  });

  it("redirects expired and denied sessions before rendering goals", async () => {
    listMock.mockRejectedValueOnce(new GoalAuthenticationErrorMock());
    await expect(GoalsPage()).rejects.toThrow("redirect:/");

    listMock.mockRejectedValueOnce(
      new GoalAuthenticationErrorMock({ reason: "not-owner" }),
    );
    await expect(GoalsPage()).rejects.toThrow("redirect:/auth/denied");
  });
});
