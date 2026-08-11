import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRoadmapRepositoryMock,
  createGoalRepositoryMock,
  createMemoryRepositoryMock,
  createCompletionRepositoryMock,
  redirectMock,
  RoadmapAuthenticationErrorMock,
  GoalAuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor(readonly accessError?: { reason?: string }) {
      super("An authenticated FitTip user is required.");
    }
  }
  return {
    createRoadmapRepositoryMock: vi.fn(),
    createGoalRepositoryMock: vi.fn(),
    createMemoryRepositoryMock: vi.fn(),
    createCompletionRepositoryMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
    RoadmapAuthenticationErrorMock: AuthenticationErrorMock,
    GoalAuthenticationErrorMock: class extends AuthenticationErrorMock {},
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/repositories/roadmap-repository", () => ({
  createRoadmapRepository: createRoadmapRepositoryMock,
  RoadmapAuthenticationError: RoadmapAuthenticationErrorMock,
}));
vi.mock("@/server/repositories/goal-repository", () => ({
  createGoalRepository: createGoalRepositoryMock,
  GoalAuthenticationError: GoalAuthenticationErrorMock,
}));
vi.mock("@/server/repositories/memory-repository", () => ({
  createMemoryRepository: createMemoryRepositoryMock,
}));
vi.mock("@/server/repositories/completion-repository", () => ({
  createCompletionRepository: createCompletionRepositoryMock,
}));
vi.mock("@/server/memory/memory-records", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/memory/memory-records")>();
  return { ...actual, utcIsoDate: () => "2026-08-10" };
});
vi.mock("@/components/roadmap/roadmap-manager", () => ({
  RoadmapManager: ({ state }: { state: Record<string, unknown> }) => (
    <div data-testid="manager-state">{JSON.stringify(state)}</div>
  ),
}));
vi.mock("@/components/roadmap/roadmap-spine", () => ({
  RoadmapSpine: () => <div>spine</div>,
}));

import RoadmapPage from "./page";

const OPEN_ID = "00000000-0000-4000-8000-000000000010";
const DECLINED_ID = "00000000-0000-4000-8000-000000000011";

let reviewProposals: {
  open: unknown;
  declinedPredecessor: unknown;
};

describe("RoadmapPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewProposals = { open: null, declinedPredecessor: null };
    createRoadmapRepositoryMock.mockResolvedValue({
      getHead: vi
        .fn()
        .mockResolvedValue({ revision: 1, currentVersionId: null }),
      listVersions: vi.fn().mockResolvedValue([]),
      getReviewProposals: vi
        .fn()
        .mockImplementation(async () => reviewProposals),
      countOpenMemoryCandidates: vi.fn().mockResolvedValue(0),
    });
    createGoalRepositoryMock.mockResolvedValue({
      list: vi.fn().mockResolvedValue({ goals: [], revision: 0 }),
    });
    createMemoryRepositoryMock.mockResolvedValue({
      list: vi.fn().mockResolvedValue({ items: [], revision: 0 }),
    });
    createCompletionRepositoryMock.mockResolvedValue({
      listCoachingCompletions: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(cleanup);

  it("reads everything the screen needs in one owner-scoped pass", async () => {
    render(await RoadmapPage());

    expect(
      screen.getByRole("heading", { name: "Where this is going." }),
    ).toBeVisible();
    expect(managerState()).toMatchObject({
      today: "2026-08-10",
      headRevision: 1,
      proposal: null,
      regeneration: null,
      regenerationsRemaining: 3,
      currentVersionNumber: null,
    });
  });

  // The regeneration defect, at the seam that lost it: a declined proposal is
  // no longer open, so without this the screen has nothing to send back.
  it("hands the declined predecessor to the surface after a decline", async () => {
    reviewProposals = {
      open: null,
      declinedPredecessor: proposal(DECLINED_ID, { regenerationNumber: 1 }),
    };

    render(await RoadmapPage());

    expect(managerState()).toMatchObject({
      proposal: null,
      regeneration: {
        previousProposalId: DECLINED_ID,
        endDate: "2026-11-02",
        planningNote: "Only 45 minutes on weekdays.",
      },
      // The next round is the second of three.
      regenerationsRemaining: 2,
    });
  });

  it("offers no predecessor while a proposal is open", async () => {
    reviewProposals = {
      open: proposal(OPEN_ID, { regenerationNumber: 0 }),
      declinedPredecessor: null,
    };

    render(await RoadmapPage());

    expect(managerState()).toMatchObject({
      proposal: { id: OPEN_ID },
      regeneration: null,
      regenerationsRemaining: 3,
    });
  });

  it("stops offering a fourth round once three have been used", async () => {
    reviewProposals = {
      open: null,
      declinedPredecessor: proposal(DECLINED_ID, { regenerationNumber: 3 }),
    };

    render(await RoadmapPage());

    expect(managerState()).toMatchObject({ regenerationsRemaining: 0 });
  });

  it("redirects an expired session before rendering owner data", async () => {
    createRoadmapRepositoryMock.mockResolvedValue({
      getHead: vi.fn().mockRejectedValue(new RoadmapAuthenticationErrorMock()),
      listVersions: vi.fn().mockResolvedValue([]),
      getReviewProposals: vi
        .fn()
        .mockResolvedValue({ open: null, declinedPredecessor: null }),
      countOpenMemoryCandidates: vi.fn().mockResolvedValue(0),
    });

    await expect(RoadmapPage()).rejects.toThrow("redirect:/");
  });

  it("redirects a denied founder-staging user to the narrow denial route", async () => {
    createRoadmapRepositoryMock.mockResolvedValue({
      getHead: vi
        .fn()
        .mockRejectedValue(
          new RoadmapAuthenticationErrorMock({ reason: "not-owner" }),
        ),
      listVersions: vi.fn().mockResolvedValue([]),
      getReviewProposals: vi
        .fn()
        .mockResolvedValue({ open: null, declinedPredecessor: null }),
      countOpenMemoryCandidates: vi.fn().mockResolvedValue(0),
    });

    await expect(RoadmapPage()).rejects.toThrow("redirect:/auth/denied");
  });

  it("lets a persistence failure reach the route error boundary", async () => {
    createRoadmapRepositoryMock.mockResolvedValue({
      getHead: vi
        .fn()
        .mockRejectedValue(new Error("The roadmap could not be saved.")),
      listVersions: vi.fn().mockResolvedValue([]),
      getReviewProposals: vi
        .fn()
        .mockResolvedValue({ open: null, declinedPredecessor: null }),
      countOpenMemoryCandidates: vi.fn().mockResolvedValue(0),
    });

    await expect(RoadmapPage()).rejects.toThrow(
      "The roadmap could not be saved.",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

function managerState(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId("manager-state").textContent ?? "{}");
}

function proposal(id: string, options: { regenerationNumber: number }) {
  return {
    id,
    origin: "ai_initial",
    sourceProposalId: null,
    content: {
      title: "Toward the hilly half",
      summary: "Twelve weeks of building.",
      phases: [],
      reviewPoints: [],
      assumptions: [],
      uncertainties: [],
      safetyConsiderations: [],
    },
    planningNote: "Only 45 minutes on weekdays.",
    regenerationFeedback: null,
    regenerationNumber: options.regenerationNumber,
    startDate: "2026-08-10",
    endDate: "2026-11-02",
    decision: null,
    createdAt: "2026-08-10T09:00:00.000Z",
  };
}
