import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSpendLedgerMock,
  compositionInputSpy,
  createProfileMock,
  createGoalMock,
  createMemoryMock,
  createCompletionLogMock,
  createRollingPlanMock,
  createRoadmapMock,
} = vi.hoisted(() => ({
  createSpendLedgerMock: vi.fn(),
  compositionInputSpy: vi.fn(),
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

const { recordGoalSuggestionMock } = vi.hoisted(() => ({
  recordGoalSuggestionMock: vi.fn(),
}));
vi.mock("@/server/goals/goal-suggestion-recording", () => ({
  recordGoalSuggestion: recordGoalSuggestionMock,
}));
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
    createPlanCoachAIService: (
      input: Parameters<typeof actual.createPlanCoachAIService>[0],
    ) => {
      compositionInputSpy(input);
      return actual.createPlanCoachAIService(input);
    },
  };
});

import type { CoachAIOwner } from "@/server/ai/owner";
import { MemoryCandidateBatchError } from "@/server/proposal-logging/memory-candidate-batch";
import {
  generatePlanProposal,
  previousPlanFits,
  reducePreviousPlan,
} from "@/server/plan-proposal/plan-generation";
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
/** A sentinel: the fixture coach never reads it, so identity is what is checked. */
const SPEND_LEDGER = { reserve: vi.fn(), settle: vi.fn() };
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

describe("previousPlanFits", () => {
  // The largest plan the database stores: three sessions on each of seven
  // days, with the longest title and sport, every one standing in for one of
  // the owner's sessions, and every one accepted beside it.
  const largest = (letter: string) =>
    ({
      items: Array.from({ length: 21 }, (_, index) => ({
        kind: "session",
        decision: "staged_beside",
        contentIndex: index,
        localDate: "2026-10-09",
        title: letter.repeat(120),
        replacesSessionId: `replaced-${index}`,
      })),
      content: {
        schemaVersion: "fittip.seven-day-plan.v2",
        weekDescription: letter.repeat(600),
        startDate: "2026-10-09",
        endDate: "2026-10-15",
        sessions: Array.from({ length: 21 }, (_, index) => ({
          date: `2026-10-${String(9 + (index % 7)).padStart(2, "0")}`,
          title: letter.repeat(120),
          sport: letter.repeat(60),
          focus: "f",
          intent: "i",
          durationMinutes: 180,
          primaryGoalId: GOAL_ID,
          rationale: "r",
        })),
      },
    }) as Parameters<typeof previousPlanFits>[0];

  const names = (letter: string) =>
    new Map(
      Array.from({ length: 21 }, (_, index) => [
        `replaced-${index}`,
        { localDate: "2026-10-09", title: letter.repeat(120) },
      ]),
    );

  it("admits the largest plan in one-byte characters, its replaced sessions named", () => {
    expect(previousPlanFits(largest("t"), names("t"))).toBe(true);
  });

  it("says no to the same plan in a three-byte script, before anything is paid for", () => {
    expect(previousPlanFits(largest("漢"))).toBe(false);
  });

  it("measures the names it will send: an ASCII plan whose replaced sessions are named in a wide script does not fit", () => {
    expect(previousPlanFits(largest("t"))).toBe(true);
    expect(previousPlanFits(largest("t"), names("漢"))).toBe(false);
  });
});

describe("what the coach is sent back of a declined proposal (owner, 19 Oct 2026)", () => {
  const session = (title: string) => ({
    date: TODAY,
    title,
    sport: "Running",
    focus: "f",
    intent: "i",
    durationMinutes: 40,
    primaryGoalId: GOAL_ID,
    rationale: "Why the coach thought so.",
  });
  type Item = Parameters<typeof reducePreviousPlan>[0]["items"][number];
  const item = (overrides: Partial<Item>): Item => ({
    kind: "session",
    decision: "proposed",
    contentIndex: null,
    localDate: TODAY,
    title: null,
    replacesSessionId: null,
    ...overrides,
  });
  const content = (sessions: ReturnType<typeof session>[]) => ({
    schemaVersion: "fittip.seven-day-plan.v2" as const,
    weekDescription: "Two runs.",
    startDate: TODAY,
    endDate: TODAY,
    sessions,
  });

  it("names every decision on every session, and none of the coach's reasons", () => {
    const reduced = reducePreviousPlan(
      {
        content: content([
          session("Accepted"),
          session("Swapped in"),
          session("Beside"),
          session("Declined"),
          session("Open"),
        ]),
        items: [
          item({ decision: "staged", contentIndex: 0 }),
          item({
            decision: "staged",
            contentIndex: 1,
            replacesSessionId: "long",
          }),
          item({
            decision: "staged_beside",
            contentIndex: 2,
            replacesSessionId: "gone",
          }),
          item({ decision: "rejected", contentIndex: 3 }),
          item({ contentIndex: 4 }),
        ],
      },
      new Map([["long", { localDate: TODAY, title: "Long run" }]]),
    );

    expect(
      reduced.days.map((day) => [day.title, day.decision, day.replaces]),
    ).toEqual([
      ["Accepted", "accepted", undefined],
      ["Swapped in", "replaced", { date: TODAY, title: "Long run" }],
      // The session it stood beside is no longer on the plan: unnamed.
      ["Beside", "addedBeside", undefined],
      ["Declined", "rejected", undefined],
      ["Open", "undecided", undefined],
    ]);
    expect(JSON.stringify(reduced)).not.toContain("Why the coach");
    expect(reduced).not.toHaveProperty("kept");
  });

  it("sends each suggested cancel with the decision on it", () => {
    const reduced = reducePreviousPlan({
      content: content([]),
      items: [
        item({ kind: "cancel", decision: "staged", title: "Intervals" }),
        item({ kind: "cancel", decision: "rejected", title: "Strength" }),
        item({ kind: "cancel", title: "Club run" }),
      ],
    });

    expect(reduced.cancels).toEqual([
      { date: TODAY, title: "Intervals", decision: "cancelled" },
      { date: TODAY, title: "Strength", decision: "kept" },
      { date: TODAY, title: "Club run", decision: "undecided" },
    ]);
  });

  it("sends no cancels when there were none", () => {
    const reduced = reducePreviousPlan({ content: content([]), items: [] });

    expect(reduced).not.toHaveProperty("cancels");
  });
});

describe("generatePlanProposal", () => {
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
    // The fixture coach repeats the note's first sentence; a live coach words
    // its own (ADR-010 decision 16, amended 18 Oct 2026).
    expect(batch.candidates[0].content).toBe(
      "I only have 45 minutes on weekdays.",
    );

    // Order matters: the proposal is committed before any memory is touched.
    expect(
      proposals.finishGenerationWithProposal.mock.invocationCallOrder[0],
    ).toBeLessThan(
      proposals.recordMemoryCandidates.mock.invocationCallOrder[0],
    );
  });

  // M3-11's reset dropped this argument and live coaching was unreachable for
  // six weeks without a single failing test. A live composition refuses
  // without a ledger, so this is the line that keeps the real coach reachable.
  it("hands the durable spend ledger to the composition", async () => {
    await generatePlanProposal(input(), {
      proposals: proposals as unknown as PlanProposalRepository,
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
    proposals.finishGenerationAsFailed.mockResolvedValue(undefined);

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).rejects.toThrow("no request scope");
    expect(proposals.finishGenerationAsFailed).toHaveBeenCalledExactlyOnceWith(
      "t1",
      "provider_unavailable",
    );
    expect(proposals.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  it("closes the claim when the answer cannot be recorded, so it holds nothing up", async () => {
    // Since 18 Oct 2026 the record also applies the replaced proposal's
    // accepted days, and a day that no longer fits refuses the whole record.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const refused = new Error("refused");
    proposals.finishGenerationWithProposal.mockRejectedValue(refused);
    proposals.finishGenerationAsFailed.mockResolvedValue(undefined);

    await expect(
      generatePlanProposal(input(), {
        proposals: proposals as unknown as PlanProposalRepository,
      }),
    ).rejects.toBe(refused);
    expect(proposals.finishGenerationAsFailed).toHaveBeenCalledExactlyOnceWith(
      "t1",
      "record_refused",
    );
  });

  it("keeps a valid proposal when the memory batch fails", async () => {
    proposals.recordMemoryCandidates.mockRejectedValue(
      new MemoryCandidateBatchError("22023"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    // The code, and never the note it was drawn from (ADR-010 decision 15).
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[fittip] plan memory candidates not recorded: 22023",
    );
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
      items: [{ decision: "staged", contentIndex: 0 }],
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

  it("records the note's goal suggestion on a first answer, never on ask again (ADR-034)", async () => {
    // The example coach suggests a goal when the note says "goal".
    const note = "New goal: run 5 km twice a week.";
    await generatePlanProposal(
      { ...input(), planningNote: note },
      { proposals: proposals as unknown as PlanProposalRepository },
    );
    expect(recordGoalSuggestionMock).toHaveBeenCalledWith(
      "plan",
      "t1",
      expect.objectContaining({ title: "New goal: run 5 km twice a week." }),
    );

    recordGoalSuggestionMock.mockClear();
    proposals.getProposal.mockResolvedValue({
      id: PREVIOUS_ID,
      items: [],
      content: {
        schemaVersion: "fittip.seven-day-plan.v2",
        weekDescription: "Rest.",
        startDate: TODAY,
        endDate: END_DATE,
        sessions: [],
      },
    });
    await generatePlanProposal(
      {
        ...input(),
        planningNote: note,
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "Less running.",
        idempotencyKey: "plan-generation-key-regen-goal",
      },
      { proposals: proposals as unknown as PlanProposalRepository },
    );
    // The same note answered again: suggesting it twice would offer the
    // owner the same goal twice.
    expect(recordGoalSuggestionMock).not.toHaveBeenCalled();
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
    desiredOutcome: "Finish without walking.",
    sports: ["Running"],
    priorityTier: "core" as const,
    status: "active" as const,
    targetDate: null,
    activeRank: 1,
  };
}
