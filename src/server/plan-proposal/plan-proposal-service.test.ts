import { describe, expect, it, vi } from "vitest";

import { CoachAIContextBelowMinimumError } from "@/server/ai/context";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { MemoryItemView } from "@/server/memory/memory-records";
import { generatePlanProposal } from "@/server/plan-proposal/plan-proposal-service";

const OWNER_ID = "40000000-0000-4000-8000-000000000001";
const GOAL_ID = "a1000000-0000-4000-8000-000000000001";
const owner = { id: OWNER_ID } as unknown as CoachAIOwner;

describe("plan proposal orchestration", () => {
  it("uses the fixture and persists an ordinary-limitation horizon", async () => {
    const deps = dependencies({ memory: [constraint()] });

    const result = await generatePlanProposal(input(), deps);

    expect(result).toEqual({
      status: "proposal",
      proposalId: "70000000-0000-4000-8000-000000000001",
      memoryCandidateCount: 0,
    });
    expect(deps.proposals.beginGeneration).toHaveBeenCalledOnce();
    expect(deps.proposals.finishGenerationWithProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        spendReservationId: null,
        content: expect.objectContaining({
          startDate: "2026-08-12",
          endDate: "2026-08-18",
        }),
      }),
    );
  });

  it("returns the rest-focused safety hold before a claim for an uncertain signal", async () => {
    const deps = dependencies({ completionSignal: true });

    await expect(generatePlanProposal(input(), deps)).resolves.toEqual({
      status: "safety-hold",
    });
    expect(deps.proposals.beginGeneration).not.toHaveBeenCalled();
    expect(deps.proposals.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  it("names a missing goal before a claim", async () => {
    const deps = dependencies({ noGoal: true });

    await expect(generatePlanProposal(input(), deps)).rejects.toMatchObject({
      missing: ["active_goal"],
    } satisfies Partial<CoachAIContextBelowMinimumError>);
    expect(deps.proposals.beginGeneration).not.toHaveBeenCalled();
  });

  it("refuses an unresolved timezone before reading or claiming", async () => {
    const deps = dependencies();

    await expect(
      generatePlanProposal({ ...input(), timezoneName: "" }, deps),
    ).rejects.toMatchObject({
      missing: ["resolved_timezone"],
    } satisfies Partial<CoachAIContextBelowMinimumError>);
    expect(deps.goals.list).not.toHaveBeenCalled();
    expect(deps.proposals.beginGeneration).not.toHaveBeenCalled();
  });
});

function input() {
  return {
    owner,
    timezoneName: "Europe/Berlin",
    startDate: "2026-08-12",
    dayCount: 7,
    planningNote: null,
    idempotencyKey: "pk_1234567890abcdef",
  };
}

function dependencies(
  options: {
    memory?: MemoryItemView[];
    completionSignal?: boolean;
    noGoal?: boolean;
  } = {},
) {
  const proposals = {
    beginGeneration: vi.fn().mockResolvedValue({
      generationId: "60000000-0000-4000-8000-000000000001",
      completionToken: "50000000-0000-4000-8000-000000000001",
      state: "claimed",
      proposalId: null,
    }),
    finishGenerationWithProposal: vi
      .fn()
      .mockResolvedValue("70000000-0000-4000-8000-000000000001"),
    finishGenerationAsFailed: vi.fn().mockResolvedValue(undefined),
    recordMemoryCandidates: vi.fn().mockResolvedValue({
      collectionRevision: 2,
      itemIds: [],
    }),
  };
  return {
    proposals,
    goals: {
      list: vi.fn().mockResolvedValue({
        revision: 1,
        goals: options.noGoal ? [] : [goal()],
      }),
    },
    memory: {
      list: vi.fn().mockResolvedValue({
        revision: 1,
        today: "2026-08-12",
        items: options.memory ?? [],
      }),
    },
    completions: {
      listCoachingCompletions: vi.fn().mockResolvedValue(
        options.completionSignal
          ? [
              {
                id: "80000000-0000-4000-8000-000000000001",
                completionGroupId: "81000000-0000-4000-8000-000000000001",
                revisionNumber: 1,
                actualLocalDate: "2026-08-11",
                status: "completed",
                painReported: true,
                illnessReported: false,
                injuryReported: false,
                severeFatigueReported: false,
                activities: [{ name: "Easy run", sport: "Running" }],
              },
            ]
          : [],
      ),
    },
    plans: { getCurrentManualPlan: vi.fn().mockResolvedValue(null) },
    now: () => new Date("2026-08-12T10:00:00.000Z"),
  };
}

function goal() {
  return {
    id: GOAL_ID,
    title: "Run a hilly half marathon",
    category: "performance_event",
    priorityTier: "core" as const,
    targetDate: "2026-10-15",
    status: "active" as const,
    archivedAt: null,
  };
}

function constraint(): MemoryItemView {
  return {
    id: "c3000000-0000-4000-8000-000000000001",
    memoryType: "constraint",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: "2026-08-01T00:00:00.000Z",
    content: "Avoid running while the knee settles; swimming is comfortable.",
    revisionNumber: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    history: [],
  };
}
