import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRoadmapRepositoryMock,
  createGoalRepositoryMock,
  createMemoryRepositoryMock,
  createCompletionRepositoryMock,
  createTrainingRecordRepositoryMock,
  createAISpendRepositoryMock,
  createServerUserClientMock,
  verifyCoachAIOwnerMock,
  generateRoadmapProposalMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createRoadmapRepositoryMock: vi.fn(),
  createGoalRepositoryMock: vi.fn(),
  createMemoryRepositoryMock: vi.fn(),
  createCompletionRepositoryMock: vi.fn(),
  createTrainingRecordRepositoryMock: vi.fn(),
  createAISpendRepositoryMock: vi.fn(),
  createServerUserClientMock: vi.fn(),
  verifyCoachAIOwnerMock: vi.fn(),
  generateRoadmapProposalMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));
vi.mock("@/server/ai/owner", () => ({
  verifyCoachAIOwner: verifyCoachAIOwnerMock,
}));
vi.mock("@/server/roadmap/roadmap-service", () => ({
  generateRoadmapProposal: generateRoadmapProposalMock,
}));
vi.mock("@/server/repositories/goal-repository", () => ({
  createGoalRepository: createGoalRepositoryMock,
}));
vi.mock("@/server/repositories/memory-repository", () => ({
  createMemoryRepository: createMemoryRepositoryMock,
}));
vi.mock("@/server/repositories/completion-repository", () => ({
  createCompletionRepository: createCompletionRepositoryMock,
}));
vi.mock("@/server/repositories/training-record-repository", () => ({
  createTrainingRecordRepository: createTrainingRecordRepositoryMock,
}));
vi.mock("@/server/repositories/ai-spend-repository", () => ({
  createAISpendRepository: createAISpendRepositoryMock,
}));
vi.mock("@/server/repositories/roadmap-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/repositories/roadmap-repository")
    >();
  return { ...actual, createRoadmapRepository: createRoadmapRepositoryMock };
});

import {
  acceptRoadmapAction,
  declineRoadmapAction,
  generateRoadmapAction,
} from "./actions";
import { INITIAL_ROADMAP_ACTION_STATE } from "./action-state";
import {
  RoadmapAuthenticationError,
  RoadmapConflictError,
} from "@/server/repositories/roadmap-repository";

const PROPOSAL_ID = "00000000-0000-4000-8000-000000000010";
const PREVIOUS_ID = "00000000-0000-4000-8000-000000000011";
const TODAY = "2026-08-10";
const END_DATE = "2026-11-02";
const KEY = "rk_0123456789abcdef0123456789abcdef";

describe("M3-02 roadmap server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCoachAIOwnerMock.mockResolvedValue({ id: "owner" });
    createServerUserClientMock.mockResolvedValue({});
    for (const create of [
      createGoalRepositoryMock,
      createMemoryRepositoryMock,
      createCompletionRepositoryMock,
      createTrainingRecordRepositoryMock,
      createAISpendRepositoryMock,
    ]) {
      create.mockResolvedValue({});
    }
    createRoadmapRepositoryMock.mockResolvedValue({
      getHead: vi.fn().mockResolvedValue({ revision: 2 }),
    });
  });

  it("carries the declined predecessor and its feedback into the request", async () => {
    generateRoadmapProposalMock.mockResolvedValue({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 2,
    });

    const result = await generateRoadmapAction(
      INITIAL_ROADMAP_ACTION_STATE,
      form({
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "The first phase is too long.",
      }),
    );

    expect(result).toMatchObject({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 2,
    });
    expect(generateRoadmapProposalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: TODAY,
        endDate: END_DATE,
        expectedHeadRevision: 2,
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "The first phase is too long.",
        idempotencyKey: KEY,
      }),
      expect.anything(),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
  });

  it("refuses a regeneration with no feedback before any provider call", async () => {
    const result = await generateRoadmapAction(
      INITIAL_ROADMAP_ACTION_STATE,
      form({ previousProposalId: PREVIOUS_ID }),
    );

    expect(result.status).toBe("validation");
    expect(result.message).toMatch(/What should the coach change\?/);
    expect(generateRoadmapProposalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("refuses feedback that names no predecessor", async () => {
    const result = await generateRoadmapAction(
      INITIAL_ROADMAP_ACTION_STATE,
      form({ regenerationFeedback: "Make it shorter." }),
    );

    expect(result).toMatchObject({
      status: "validation",
      message: "Feedback belongs to a regeneration, not a first request.",
    });
    expect(generateRoadmapProposalMock).not.toHaveBeenCalled();
  });

  it("returns the owner's own words to their own screen on a rejection", async () => {
    const result = await generateRoadmapAction(
      INITIAL_ROADMAP_ACTION_STATE,
      form({ idempotencyKey: "too-short", planningNote: "Only 45 minutes." }),
    );

    expect(result.status).toBe("validation");
    expect(result.draft?.planningNote).toBe("Only 45 minutes.");
    expect(generateRoadmapProposalMock).not.toHaveBeenCalled();
  });

  it("names the regeneration ceiling rather than reporting a generic failure", async () => {
    generateRoadmapProposalMock.mockRejectedValue(
      new RoadmapConflictError("regeneration-cap"),
    );

    const result = await generateRoadmapAction(
      INITIAL_ROADMAP_ACTION_STATE,
      form({
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "Again, please.",
      }),
    );

    expect(result.status).toBe("cap-reached");
    expect(result.message).toMatch(/all three regenerations/);
  });

  it.each([
    ["sources-changed", "conflict", /goals, memory or training changed/],
    ["already-decided", "conflict", /already been decided/],
    ["stale", "conflict", /changed in another tab/],
  ])(
    "maps a %s conflict to an honest screen state",
    async (reason, status, copy) => {
      createRoadmapRepositoryMock.mockResolvedValue({
        acceptProposal: vi
          .fn()
          .mockRejectedValue(
            new RoadmapConflictError(
              reason as ConstructorParameters<typeof RoadmapConflictError>[0],
            ),
          ),
      });

      const result = await acceptRoadmapAction(PROPOSAL_ID, 2);

      expect(result.status).toBe(status);
      expect(result.message).toMatch(copy);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("accepts through the transaction and revalidates the surface", async () => {
    const acceptProposal = vi.fn().mockResolvedValue({
      proposalId: PROPOSAL_ID,
      versionId: "00000000-0000-4000-8000-000000000020",
      headRevision: 3,
      result: "accepted",
    });
    createRoadmapRepositoryMock.mockResolvedValue({ acceptProposal });

    await expect(acceptRoadmapAction(PROPOSAL_ID, 2)).resolves.toMatchObject({
      status: "accepted",
      proposalId: PROPOSAL_ID,
    });
    expect(acceptProposal).toHaveBeenCalledWith(PROPOSAL_ID, 2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
  });

  it("rejects a malformed proposal id before reaching the database", async () => {
    const acceptProposal = vi.fn();
    createRoadmapRepositoryMock.mockResolvedValue({ acceptProposal });

    const result = await acceptRoadmapAction("../../etc/passwd", 2);

    expect(result.status).toBe("validation");
    expect(acceptProposal).not.toHaveBeenCalled();
  });

  it("declines without claiming anything became current", async () => {
    const declineProposal = vi.fn().mockResolvedValue(undefined);
    createRoadmapRepositoryMock.mockResolvedValue({ declineProposal });

    await expect(declineRoadmapAction(PROPOSAL_ID)).resolves.toMatchObject({
      status: "declined",
      proposalId: PROPOSAL_ID,
    });
    expect(declineProposal).toHaveBeenCalledWith(PROPOSAL_ID);
  });

  it("reports an expired session as a session state, not a save failure", async () => {
    createRoadmapRepositoryMock.mockResolvedValue({
      declineProposal: vi
        .fn()
        .mockRejectedValue(new RoadmapAuthenticationError()),
    });

    await expect(declineRoadmapAction(PROPOSAL_ID)).resolves.toMatchObject({
      status: "session",
      message: "Your session ended. Sign in again before continuing.",
    });
  });

  it("never lets a database message reach the screen", async () => {
    createRoadmapRepositoryMock.mockResolvedValue({
      declineProposal: vi
        .fn()
        .mockRejectedValue(
          new Error('duplicate key value violates unique constraint "x"'),
        ),
    });

    const result = await declineRoadmapAction(PROPOSAL_ID);

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "The roadmap could not be prepared. Nothing was saved.",
    );
  });
});

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("today", TODAY);
  data.set("endDate", END_DATE);
  data.set("idempotencyKey", KEY);
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}
