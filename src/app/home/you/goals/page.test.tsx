import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRepositoryMock,
  listMock,
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
    listMock: vi.fn(),
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
vi.mock("@/components/goals/goal-manager", () => ({
  GoalManager: ({
    expectedRevision,
    initialGoals,
  }: {
    expectedRevision: number;
    initialGoals: unknown[];
  }) => (
    <div>
      Goals revision {expectedRevision}, count {initialGoals.length}
    </div>
  ),
}));

import GoalsPage from "./page";

describe("GoalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRepositoryMock.mockResolvedValue({ list: listMock });
  });
  afterEach(cleanup);

  it("loads only the authenticated collection on the server", async () => {
    listMock.mockResolvedValue({ revision: 3, goals: [{ id: "goal" }] });
    render(await GoalsPage());
    expect(screen.getByText("Goals revision 3, count 1")).toBeVisible();
    expect(listMock).toHaveBeenCalledOnce();
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
