import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
} = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  createGoalMock: vi.fn(),
  createMemoryMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  createRollingPlanMock: vi.fn(),
}));

vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/goal-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/goal-repository")>();
  return { ...actual, createGoalRepository: createGoalMock };
});
vi.mock("@/server/repositories/memory-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/memory-repository")>();
  return { ...actual, createMemoryRepository: createMemoryMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createRollingPlanMock };
});

import type { CoachAIOwner } from "@/server/ai/owner";
import type { RoadmapRepository } from "@/server/repositories/roadmap-repository";
import { RoadmapConflictError } from "@/server/repositories/roadmap-repository";
import { generateRoadmapProposal } from "@/server/roadmap/roadmap-generation";
import { addDays } from "@/server/roadmap/roadmap-records";

/**
 * Generation, against the real composition root.
 *
 * The coaching service is deliberately *not* stubbed here. The ticket's third
 * acceptance criterion is that generation reaches the fixture adapter and no
 * paid provider while live enablement is absent, and a test that injected a
 * fake coach would prove nothing about which one production resolves. So the
 * owner's repositories are mocked, `createRoadmapCoachAIService` runs for real,
 * and the assertions are about what actually came back: the provenance recorded
 * against the proposal, the absence of a spend reservation, and the fact that
 * nothing opened a socket.
 */

const OWNER_ID = "9f150000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;
const GOAL_ID = "9f150000-0000-4000-8000-000000000020";
const PROPOSAL_ID = "9f150000-0000-4000-8000-000000000030";
const TIMEZONE = "Europe/Berlin";

const TODAY = new Date().toISOString().slice(0, 10);
const END_DATE = addDays(TODAY, 84);

const roadmaps = {
  getProposal: vi.fn(),
  beginGeneration: vi.fn(),
  finishGenerationWithProposal: vi.fn(),
  finishGenerationAsFailed: vi.fn(),
  recordMemoryCandidates: vi.fn(),
};

describe("generateRoadmapProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ userId: OWNER_ID, timezoneName: TIMEZONE }),
    });
    createGoalMock.mockResolvedValue({
      list: vi.fn().mockResolvedValue({ revision: 4, goals: [goal()] }),
    });
    createMemoryMock.mockResolvedValue({
      list: vi.fn().mockResolvedValue({ revision: 7, items: [] }),
    });
    createCompletionLogMock.mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    });
    createRollingPlanMock.mockResolvedValue({
      getPlanSlice: vi
        .fn()
        .mockResolvedValue({ revision: 2, sessions: [], recoveryDays: [] }),
      materializeSeries: vi
        .fn()
        .mockResolvedValue({ createdCount: 0, skipped: [] }),
    });

    roadmaps.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "claimed",
      regenerationNumber: 0,
      proposalId: null,
    });
    roadmaps.finishGenerationWithProposal.mockResolvedValue(PROPOSAL_ID);
    roadmaps.recordMemoryCandidates.mockResolvedValue({
      collectionRevision: 8,
      itemIds: [],
    });
  });

  it("answers from the fixture coach and spends nothing when live is absent", async () => {
    // Any attempt to leave the process is a failure of the thing under test,
    // not something to assert about after the fact.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("no network is permitted here"));

    const result = await generateRoadmapProposal(input(), {
      roadmaps: roadmaps as unknown as RoadmapRepository,
    });

    expect(result).toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const persisted = roadmaps.finishGenerationWithProposal.mock.calls[0][0];
    // The three codes the database checks together. `fixture-no-spend` is only
    // accepted with no reservation, and the live card is only accepted with
    // one, so this triple cannot describe a call anybody paid for.
    expect(persisted.providerCode).toBe("fixture");
    expect(persisted.modelCode).toBe("fixture-corpus-v1");
    expect(persisted.rateCardVersion).toBe("fixture-no-spend");
    expect(persisted.spendReservationId).toBeNull();
    expect(persisted.schemaVersion).toBe("fittip.roadmap.v2");
    // The horizon the owner composed against, not one the coach chose.
    expect(persisted.content.startDate).toBe(TODAY);
    expect(persisted.content.endDate).toBe(END_DATE);
  });

  // The claim is what makes a same-key retry cheap. Only the caller holding
  // `claimed` may reach the coach; every other state stops before it.
  it("calls no coach when the claim is a replay", async () => {
    roadmaps.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "pending",
      regenerationNumber: 0,
      proposalId: null,
    });

    await expect(
      generateRoadmapProposal(input(), {
        roadmaps: roadmaps as unknown as RoadmapRepository,
      }),
    ).resolves.toEqual({ status: "pending" });

    expect(roadmaps.finishGenerationWithProposal).not.toHaveBeenCalled();
    expect(createGoalMock).not.toHaveBeenCalled();
  });

  it("returns the existing proposal when the key already completed", async () => {
    roadmaps.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "completed",
      regenerationNumber: 0,
      proposalId: PROPOSAL_ID,
    });

    await expect(
      generateRoadmapProposal(input(), {
        roadmaps: roadmaps as unknown as RoadmapRepository,
      }),
    ).resolves.toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
    expect(roadmaps.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  // The predecessor is read before the claim, so a regeneration that cannot
  // find one fails without consuming a key.
  it("refuses a regeneration whose predecessor is gone, before claiming", async () => {
    roadmaps.getProposal.mockResolvedValue(null);

    await expect(
      generateRoadmapProposal(
        {
          ...input(),
          previousProposalId: PROPOSAL_ID,
          regenerationFeedback: "Less volume.",
        },
        { roadmaps: roadmaps as unknown as RoadmapRepository },
      ),
    ).rejects.toBeInstanceOf(RoadmapConflictError);

    expect(roadmaps.beginGeneration).not.toHaveBeenCalled();
  });

  // The fingerprint is what makes a reused key with different input a conflict
  // rather than a replay of somebody else's question. It carries the lengths of
  // the owner's text, never the text: a content hash leaks by comparison.
  it("fingerprints the horizon and the text lengths, and no owner text", async () => {
    await generateRoadmapProposal(
      { ...input(), planningNote: "Tuesdays are impossible." },
      { roadmaps: roadmaps as unknown as RoadmapRepository },
    );

    const { requestFingerprint } = roadmaps.beginGeneration.mock.calls[0][0];
    expect(requestFingerprint).toBe(
      `roadmap.v2:${TODAY}:${END_DATE}:0:initial:24:0`,
    );
    expect(requestFingerprint).not.toContain("Tuesdays");
  });

  // A memory conflict must not roll back a valid roadmap. ADR-015 draws that
  // boundary deliberately and names the alternative it rejected.
  it("keeps the roadmap when the memory batch fails", async () => {
    roadmaps.recordMemoryCandidates.mockRejectedValue(new Error("conflict"));

    await expect(
      generateRoadmapProposal(
        { ...input(), planningNote: "Tuesdays are impossible." },
        { roadmaps: roadmaps as unknown as RoadmapRepository },
      ),
    ).resolves.toMatchObject({ status: "proposal", proposalId: PROPOSAL_ID });
  });
});

function input() {
  return {
    owner: OWNER,
    startDate: TODAY,
    endDate: END_DATE,
    expectedHeadRevision: 0,
    planningNote: null,
    previousProposalId: null,
    regenerationFeedback: null,
    idempotencyKey: "m3-15f-generation-key-0001",
  };
}

function goal() {
  return {
    id: GOAL_ID,
    title: "Finish a half marathon",
    category: "endurance",
    priorityTier: "core" as const,
    targetDate: addDays(TODAY, 70),
    status: "active" as const,
    archivedAt: null,
  };
}
