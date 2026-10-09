import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSpendLedgerMock,
  compositionInputSpy,
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
} = vi.hoisted(() => ({
  createSpendLedgerMock: vi.fn(),
  compositionInputSpy: vi.fn(),
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

vi.mock("@/server/repositories/ai-spend-repository", () => ({
  createAISpendRepository: createSpendLedgerMock,
}));
// Passed through to the real composition root; the spy only records what it
// was handed, so every assertion below still runs against what production
// resolves.
vi.mock("@/server/ai/composition", async (original) => {
  const actual = await original<typeof import("@/server/ai/composition")>();
  return {
    ...actual,
    createRoadmapCoachAIService: (
      input: Parameters<typeof actual.createRoadmapCoachAIService>[0],
    ) => {
      compositionInputSpy(input);
      return actual.createRoadmapCoachAIService(input);
    },
  };
});

import type { CoachAIOwner } from "@/server/ai/owner";
import { MemoryCandidateBatchError } from "@/server/proposal-logging/memory-candidate-batch";
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
/** A sentinel: the fixture coach never reads it, so identity is what is checked. */
const SPEND_LEDGER = { reserve: vi.fn(), settle: vi.fn() };
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
  // The batch-failure tests spy on the console; never leak one past its test.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    createSpendLedgerMock.mockResolvedValue(SPEND_LEDGER);
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ userId: OWNER_ID, timezoneName: TIMEZONE }),
      // Nothing entered in Settings: the coach is told so, not refused.
      getDetails: vi.fn().mockResolvedValue(null),
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
      listSeries: vi.fn().mockResolvedValue([]),
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

  // M3-11's reset dropped this argument and live coaching was unreachable for
  // six weeks without a single failing test. A live composition refuses
  // without a ledger, so this is the line that keeps the real coach reachable.
  it("hands the durable spend ledger to the composition", async () => {
    await generateRoadmapProposal(input(), {
      roadmaps: roadmaps as unknown as RoadmapRepository,
    });

    expect(createSpendLedgerMock).toHaveBeenCalledOnce();
    expect(compositionInputSpy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ spendLedger: SPEND_LEDGER }),
    );
  });

  // A refusal while composing is a failed generation like any other. Before
  // composition moved inside the try, it stranded the claim as pending.
  it("closes the claim when the coach cannot be composed", async () => {
    createSpendLedgerMock.mockRejectedValue(new Error("no request scope"));
    roadmaps.finishGenerationAsFailed.mockResolvedValue(undefined);

    await expect(
      generateRoadmapProposal(input(), {
        roadmaps: roadmaps as unknown as RoadmapRepository,
      }),
    ).rejects.toThrow("no request scope");
    expect(roadmaps.finishGenerationAsFailed).toHaveBeenCalledExactlyOnceWith(
      "t1",
      "provider_unavailable",
    );
    expect(roadmaps.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  // A memory conflict must not roll back a valid roadmap. ADR-015 draws that
  // boundary deliberately and names the alternative it rejected.
  it("keeps the roadmap when the memory batch fails", async () => {
    roadmaps.recordMemoryCandidates.mockRejectedValue(
      new MemoryCandidateBatchError("PT409"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      generateRoadmapProposal(
        { ...input(), planningNote: "Tuesdays are impossible." },
        { roadmaps: roadmaps as unknown as RoadmapRepository },
      ),
    ).resolves.toMatchObject({ status: "proposal", proposalId: PROPOSAL_ID });
    // The code, and never the note it was drawn from (ADR-010 decision 15).
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[fittip] roadmap memory candidates not recorded: PT409",
    );
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
    desiredOutcome: "Finish without walking.",
    sports: ["Running"],
    priorityTier: "core" as const,
    targetDate: addDays(TODAY, 70),
    status: "active" as const,
  };
}
