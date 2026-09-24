import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
  createRoadmapMock,
} = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  createGoalMock: vi.fn(),
  createMemoryMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  createRollingPlanMock: vi.fn(),
  createRoadmapMock: vi.fn(),
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
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});

import type { CoachAIOwner } from "@/server/ai/owner";
import { generatePlanProposal } from "@/server/plan-proposal/plan-generation";
import type { PlanProposalRepository } from "@/server/repositories/plan-proposal-repository";

/**
 * Generation, against the real composition root.
 *
 * The coaching service is deliberately *not* stubbed. The point of this suite
 * is that generation reaches the fixture adapter and no paid provider while
 * live enablement is absent, and a test that injected a fake coach would prove
 * nothing about which one production resolves. So the owner's repositories are
 * mocked, `createPlanCoachAIService` runs for real, and the assertions are
 * about what actually came back.
 */

const OWNER_ID = "7c160000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;
const GOAL_ID = "7c160000-0000-4000-8000-000000000020";
const PROPOSAL_ID = "7c160000-0000-4000-8000-000000000030";
const PREVIOUS_ID = "7c160000-0000-4000-8000-000000000031";
const TIMEZONE = "Europe/Berlin";

const TODAY = new Date().toISOString().slice(0, 10);
const END_DATE = new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + 6 * 86_400_000)
  .toISOString()
  .slice(0, 10);

const proposals = {
  getLatestProposal: vi.fn(),
  getProposal: vi.fn(),
  beginGeneration: vi.fn(),
  finishGenerationWithProposal: vi.fn(),
  finishGenerationAsFailed: vi.fn(),
  recordMemoryCandidates: vi.fn(),
};

describe("generatePlanProposal", () => {
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
    // No accepted roadmap: the goals-only path, which is what these assertions
    // are about. `roadmap-plan-context.test.ts` covers the other one.
    createRoadmapMock.mockResolvedValue({
      getCurrentVersion: vi.fn().mockResolvedValue(null),
    });

    proposals.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "claimed",
      proposalId: null,
    });
    proposals.finishGenerationWithProposal.mockResolvedValue(PROPOSAL_ID);
    proposals.recordMemoryCandidates.mockResolvedValue({
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

    const result = await generatePlanProposal(input(), {
      proposals: proposals as unknown as PlanProposalRepository,
    });

    expect(result).toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const persisted = proposals.finishGenerationWithProposal.mock.calls[0][0];
    // The three codes the database checks together. `fixture-no-spend` is only
    // accepted with no reservation, and a live card is only accepted with one,
    // so this triple cannot describe a call anybody paid for.
    expect(persisted.providerCode).toBe("fixture");
    expect(persisted.modelCode).toBe("fixture-corpus-v1");
    expect(persisted.rateCardVersion).toBe("fixture-no-spend");
    expect(persisted.spendReservationId).toBeNull();
    expect(persisted.schemaVersion).toBe("fittip.seven-day-plan.v2");
    // The horizon the owner asked for, not one the coach chose.
    expect(persisted.content.startDate).toBe(TODAY);
    expect(persisted.content.endDate).toBe(END_DATE);
    expect(persisted.content.sessions.length).toBeGreaterThan(0);
  });

  // The claim is what makes a same-key retry cheap. Only the caller holding
  // `claimed` may reach the coach; every other state stops before it.
  it("calls no coach when the claim is a replay", async () => {
    proposals.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "pending",
      proposalId: null,
    });

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).resolves.toEqual({ status: "pending" });

    expect(proposals.finishGenerationWithProposal).not.toHaveBeenCalled();
    expect(createGoalMock).not.toHaveBeenCalled();
  });

  it("proposes memory candidates from the planning note, after the proposal", async () => {
    proposals.recordMemoryCandidates.mockResolvedValue({
      collectionRevision: 8,
      itemIds: ["item-1"],
    });

    const result = await generatePlanProposal(
      { ...input(), planningNote: "I only have 45 minutes on weekdays." },
      { proposals: proposals as unknown as PlanProposalRepository },
    );

    expect(result).toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 1,
    });

    // The revision read from the memory collection, not one this module
    // invented: the route refuses a stale one, which is what makes the owner's
    // own concurrent memory edit win rather than being silently overwritten.
    const batch = proposals.recordMemoryCandidates.mock.calls[0][0];
    expect(batch.expectedMemoryRevision).toBe(7);
    expect(batch.completionToken).toBe("t1");
    expect(batch.candidates).toHaveLength(1);
    // Every candidate quotes the note the owner wrote. ADR-010 decision 16
    // makes that non-optional, and the database enforces it too.
    expect("I only have 45 minutes on weekdays.").toContain(
      batch.candidates[0].sourceExcerpt,
    );

    // Order matters: the proposal is committed before any memory is touched.
    expect(
      proposals.finishGenerationWithProposal.mock.invocationCallOrder[0],
    ).toBeLessThan(
      proposals.recordMemoryCandidates.mock.invocationCallOrder[0],
    );
  });

  it("keeps a valid proposal when the memory batch fails", async () => {
    proposals.recordMemoryCandidates.mockRejectedValue(
      new Error("memory changed"),
    );

    // ADR-015's boundary: one memory conflict must not turn a plan proposal
    // the owner can act on into a failed generation.
    await expect(
      generatePlanProposal(
        { ...input(), planningNote: "I only have 45 minutes on weekdays." },
        { proposals: proposals as unknown as PlanProposalRepository },
      ),
    ).resolves.toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
  });

  it("asks for no memory batch when the note proposes nothing", async () => {
    await generatePlanProposal(input(), {
      proposals: proposals as unknown as PlanProposalRepository,
    });

    expect(proposals.recordMemoryCandidates).not.toHaveBeenCalled();
  });

  it("carries the rejected proposal and the feedback into the claim", async () => {
    proposals.getProposal.mockResolvedValue({
      id: PREVIOUS_ID,
      content: {
        schemaVersion: "fittip.seven-day-plan.v2",
        weekDescription: "Three easy days and a longer weekend run.",
        startDate: TODAY,
        endDate: END_DATE,
        sessions: [
          {
            date: TODAY,
            title: "Easy aerobic session",
            sport: "Running",
            focus: "f",
            intent: "i",
            durationMinutes: 45,
            primaryGoalId: GOAL_ID,
            rationale: "r",
          },
        ],
      },
    });

    await generatePlanProposal(
      {
        ...input(),
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "Too much running, not enough rest.",
      },
      { proposals: proposals as unknown as PlanProposalRepository },
    );

    const claim = proposals.beginGeneration.mock.calls[0][0];
    expect(claim.previousProposalId).toBe(PREVIOUS_ID);
    expect(claim.regenerationFeedback).toBe(
      "Too much running, not enough rest.",
    );
    // The same key with different feedback is a different question, so the
    // fingerprint has to distinguish them — by length, never by content.
    expect(claim.requestFingerprint).toContain(PREVIOUS_ID);

    // It travels again on finish, where the database proves it against the
    // hash the claim stored.
    const finish = proposals.finishGenerationWithProposal.mock.calls[0][0];
    expect(finish.regenerationFeedback).toBe(
      "Too much running, not enough rest.",
    );
  });

  it("claims nothing when the proposal being replaced cannot be read", async () => {
    proposals.getProposal.mockResolvedValue(null);

    await expect(
      generatePlanProposal(
        {
          ...input(),
          previousProposalId: PREVIOUS_ID,
          regenerationFeedback: "Too much running.",
        },
        { proposals: proposals as unknown as PlanProposalRepository },
      ),
    ).rejects.toThrow();

    // Before the claim, so nothing is reserved and no provider is called for a
    // regeneration of something that is not there.
    expect(proposals.beginGeneration).not.toHaveBeenCalled();
  });

  it("returns the existing proposal when the key already completed", async () => {
    proposals.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "completed",
      proposalId: PROPOSAL_ID,
    });

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).resolves.toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      // A replay created nothing, so it counts nothing. What is actually
      // waiting is read from the memory surface, not inferred from here.
      memoryCandidateCount: 0,
    });
    expect(proposals.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  it("reports a failed key without calling the coach again", async () => {
    proposals.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "failed",
      proposalId: null,
    });

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).resolves.toEqual({ status: "failed" });
    expect(proposals.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  /**
   * The fingerprint carries the *length* of the planning note, never the note.
   * A content hash would let anyone holding two fingerprints tell whether two
   * notes were the same, which is a comparison the owner never agreed to.
   */
  it("fingerprints the request without carrying the note's content", async () => {
    await generatePlanProposal(
      { ...input(), planningNote: "No running this week, my knee hurts." },
      { proposals: proposals as unknown as PlanProposalRepository },
    );

    const fingerprint =
      proposals.beginGeneration.mock.calls[0][0].requestFingerprint;
    expect(fingerprint).toContain(TODAY);
    expect(fingerprint).toContain("36");
    expect(fingerprint).not.toContain("knee");
    expect(fingerprint).not.toContain("running");
  });

  /**
   * A coach that never answered must not leave the owner behind a pending
   * attempt they cannot clear, and the code that closes it comes from a fixed
   * enum rather than from the provider.
   */
  it("closes the claim with a bounded code when the coach throws", async () => {
    createGoalMock.mockResolvedValue({
      list: vi.fn().mockRejectedValue(new Error("context read failed")),
    });

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).rejects.toThrow();

    expect(proposals.finishGenerationAsFailed).toHaveBeenCalledTimes(1);
    const [token, code] = proposals.finishGenerationAsFailed.mock.calls[0];
    expect(token).toBe("t1");
    expect(code).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
  });
});

function input() {
  return {
    owner: OWNER,
    startDate: TODAY,
    endDate: END_DATE,
    dayCount: 7,
    expectedPlanRevision: 2,
    planningNote: null,
    idempotencyKey: "plan-proposal-key-0000001",
  };
}

function goal() {
  return {
    id: GOAL_ID,
    title: "Run a half marathon",
    category: "endurance",
    priorityTier: "core" as const,
    status: "active" as const,
    archivedAt: null,
    targetDate: null,
    activeRank: 1,
  };
}
