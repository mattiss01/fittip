import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  createProposalsMock,
  createProfileMock,
  createRollingPlanMock,
  createServerUserClientMock,
  verifyOwnerMock,
  generateMock,
  createCompletionLogMock,
} = vi.hoisted(() => ({
  createCompletionLogMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  createProposalsMock: vi.fn(),
  createProfileMock: vi.fn(),
  createRollingPlanMock: vi.fn(),
  createServerUserClientMock: vi.fn(),
  verifyOwnerMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));
vi.mock("@/server/repositories/plan-proposal-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/plan-proposal-repository")
    >();
  return { ...actual, createPlanProposalRepository: createProposalsMock };
});
vi.mock("@/server/repositories/completion-log-repository", () => ({
  createCompletionLog: createCompletionLogMock,
}));
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createRollingPlanMock };
});
vi.mock("@/server/ai/owner", async (original) => {
  const actual = await original<typeof import("@/server/ai/owner")>();
  return { ...actual, verifyCoachAIOwner: verifyOwnerMock };
});
vi.mock("@/server/plan-proposal/plan-generation", () => ({
  generatePlanProposal: generateMock,
}));

import {
  generatePlanProposalAction,
  regeneratePlanProposalAction,
} from "./actions";
import { INITIAL_PLAN_PROPOSAL_ACTION_STATE } from "./action-state";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import { CoachAIError } from "@/server/ai/errors";
import {
  PlanProposalConflictError,
  PlanProposalRuleError,
} from "@/server/repositories/plan-proposal-repository";

/**
 * `regeneratePlanProposalAction`, at its own boundary.
 *
 * It carries two of the owner's decisions of 24 September 2026: the review is
 * closed before the coach is asked again, and what the owner already accepted is
 * applied rather than lost. The pgTAP proves the database half. What is proved
 * here is the action's half — the order of its writes, what is refused before
 * any of them, and that every failure after the review closed says so rather
 * than claiming nothing was written.
 *
 * `generatePlanProposal` is stubbed; `plan-generation.test.ts` proves it
 * against the real composition root.
 */

const OWNER_ID = "7c170000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "7c170000-0000-4000-8000-000000000030";
const IDEMPOTENCY_KEY = "7c170000-0000-4000-8000-0000000000aa";
const TIMEZONE = "Europe/Berlin";
const GENERATION_ID = "7c170000-0000-4000-8000-000000000040";
const OUTCOMES = PLAN_PROPOSAL_COPY.outcomes;

const getProposal = vi.fn();
const decideItem = vi.fn();
const finishReview = vi.fn();
const getPlanSlice = vi.fn();
const listReplaceableSessions = vi.fn();
const listCompletions = vi.fn();
const KEPT_ID = "7c170000-0000-4000-8000-0000000000b1";
const LOGGED_ID = "7c170000-0000-4000-8000-0000000000b2";
const GONE_ID = "7c170000-0000-4000-8000-0000000000b3";

describe("regeneratePlanProposalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerUserClientMock.mockResolvedValue({});
    verifyOwnerMock.mockResolvedValue({ id: OWNER_ID });
    createProposalsMock.mockResolvedValue({
      getProposal,
      decideItem,
      finishReview,
      listReplaceableSessions,
    });
    listReplaceableSessions.mockResolvedValue([]);
    createCompletionLogMock.mockResolvedValue({
      findByPlanSessions: listCompletions,
    });
    listCompletions.mockResolvedValue([]);
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ userId: OWNER_ID, timezoneName: TIMEZONE }),
    });
    createRollingPlanMock.mockResolvedValue({ getPlanSlice });
    getProposal.mockResolvedValue(openProposal());
    decideItem.mockResolvedValue(undefined);
    finishReview.mockResolvedValue({ appliedCount: 1 });
    getPlanSlice.mockResolvedValue({ revision: 5, sessions: [] });
    generateMock.mockResolvedValue({
      status: "proposal",
      proposalId: "7c170000-0000-4000-8000-000000000031",
      memoryCandidateCount: 0,
    });
  });

  it("carries over only the marks that can still be replaced", async () => {
    // Three sessions were marked. One is still planned, one has been logged
    // since, and one was replaced by the finish that closed the review.
    listReplaceableSessions.mockResolvedValue([
      { sessionId: KEPT_ID, handle: "r1" },
      { sessionId: LOGGED_ID, handle: "r2" },
      { sessionId: GONE_ID, handle: "r3" },
    ]);
    getPlanSlice.mockResolvedValue({
      revision: 5,
      sessions: [
        { id: KEPT_ID, status: "active" },
        { id: LOGGED_ID, status: "active" },
      ],
    });
    listCompletions.mockResolvedValue([{ planSessionId: LOGGED_ID }]);

    await regenerate();

    expect(listReplaceableSessions).toHaveBeenCalledExactlyOnceWith(
      GENERATION_ID,
    );
    expect(generateMock.mock.calls[0][0]).toMatchObject({
      replaceableSessionIds: [KEPT_ID],
    });
  });

  it("refuses missing feedback before anything is written", async () => {
    const state = await regenerate({ regenerationFeedback: "   " });

    expect(state.status).toBe("validation");
    expect(decideItem).not.toHaveBeenCalled();
    expect(finishReview).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("refuses feedback the context would refuse, before anything is written", async () => {
    const state = await regenerate({ regenerationFeedback: "x".repeat(501) });

    expect(state.status).toBe("validation");
    expect(finishReview).not.toHaveBeenCalled();
  });

  it("refuses a key the finish would not accept, before anything is written", async () => {
    const state = await regenerate({ idempotencyKey: "a".repeat(16) });

    expect(state.status).toBe("validation");
    expect(decideItem).not.toHaveBeenCalled();
    expect(finishReview).not.toHaveBeenCalled();
  });

  it("refuses a proposal that is already decided", async () => {
    getProposal.mockResolvedValue({ ...openProposal(), decision: "applied" });

    const state = await regenerate();

    expect(state.status).toBe("validation");
    expect(decideItem).not.toHaveBeenCalled();
    expect(finishReview).not.toHaveBeenCalled();
  });

  it("rejects only the undecided items, closes the review, then asks again", async () => {
    const state = await regenerate();

    // A staged (accepted) day is left alone, so the finish applies it.
    expect(decideItem.mock.calls).toEqual([
      [PROPOSAL_ID, 1, "rejected"],
      [PROPOSAL_ID, 3, "rejected"],
    ]);
    expect(finishReview).toHaveBeenCalledExactlyOnceWith({
      proposalId: PROPOSAL_ID,
      expectedPlanRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(decideItem.mock.invocationCallOrder.at(-1)).toBeLessThan(
      finishReview.mock.invocationCallOrder[0],
    );
    expect(finishReview.mock.invocationCallOrder[0]).toBeLessThan(
      generateMock.mock.invocationCallOrder[0],
    );
    expect(state).toMatchObject({
      status: "proposal",
      message: OUTCOMES.regenerated,
    });
  });

  it("asks again over the same span from the owner's today, against the plan as it now is", async () => {
    await regenerate();

    const today = isoDateInTimezone(new Date(), TIMEZONE);
    const [request] = generateMock.mock.calls[0];
    expect(request).toMatchObject({
      owner: { id: OWNER_ID },
      startDate: today,
      endDate: shiftIsoDate(today, 2),
      dayCount: 3,
      // The revision after the finish applied, not the one the form carried.
      expectedPlanRevision: 5,
      planningNote: "Short on Thursdays.",
      previousProposalId: PROPOSAL_ID,
      regenerationFeedback: "Less running.",
      // Distinct from the finish's key, which the same RPC family has spent.
      idempotencyKey: `${IDEMPOTENCY_KEY}-regen`,
    });
  });

  it("keeps a first day that is still ahead, rather than moving it to today", async () => {
    const today = isoDateInTimezone(new Date(), TIMEZONE);
    const start = shiftIsoDate(today, 5);
    getProposal.mockResolvedValue({
      ...openProposal(),
      startDate: start,
      endDate: shiftIsoDate(start, 2),
    });

    await regenerate();

    expect(generateMock.mock.calls[0][0]).toMatchObject({
      startDate: start,
      endDate: shiftIsoDate(start, 2),
      dayCount: 3,
    });
    expect(getPlanSlice).toHaveBeenLastCalledWith(
      start,
      shiftIsoDate(start, 2),
    );
  });

  it("refreshes the plan before the coach is asked, so a lost answer leaves it right", async () => {
    await regenerate();

    const planRefresh = revalidatePathMock.mock.calls.findIndex(
      ([path]) => path === "/home/plan",
    );
    expect(planRefresh).toBeGreaterThanOrEqual(0);
    expect(
      revalidatePathMock.mock.invocationCallOrder[planRefresh],
    ).toBeLessThan(generateMock.mock.invocationCallOrder[0]);
  });

  it("says the review was applied when the coach fails afterwards", async () => {
    generateMock.mockRejectedValue(new CoachAIError("provider_unavailable"));

    const state = await regenerate();

    // Never `generationFailed`, whose copy says nothing was written.
    expect(state).toMatchObject({
      status: "error",
      message: OUTCOMES.regenerationLost,
    });
  });

  it("says the review was applied when generation comes back failed", async () => {
    generateMock.mockResolvedValue({ status: "failed" });

    const state = await regenerate();

    expect(state).toMatchObject({
      status: "error",
      message: OUTCOMES.regenerationLost,
    });
  });

  it("names the regeneration ceiling and that the accepted days were kept", async () => {
    generateMock.mockRejectedValue(
      new PlanProposalRuleError("regeneration-cap"),
    );

    const state = await regenerate();

    expect(state).toMatchObject({
      status: "error",
      message: `${OUTCOMES.regenerationCap} ${OUTCOMES.regenerationKept}`,
    });
  });

  it("says the accepted days were kept when the plan moves before the coach answers", async () => {
    generateMock.mockRejectedValue(new PlanProposalConflictError("stale"));

    const state = await regenerate();

    // The conflict copy's own "nothing was added" then contradicts this suffix;
    // NEXT.md carries that wording as a follow-up. What is pinned is the half
    // that must hold: the owner is told their accepted days stayed.
    expect(state.status).toBe("error");
    expect(state.message).toContain(OUTCOMES.regenerationKept);
    expect(state.message).not.toBe(OUTCOMES.generationFailed);
  });

  it("reports a generation already under way without claiming a new one", async () => {
    generateMock.mockResolvedValue({ status: "pending" });

    const state = await regenerate();

    expect(state).toMatchObject({
      status: "pending",
      message: OUTCOMES.generationPending,
    });
  });

  it("stops before the finish when rejecting an undecided item fails", async () => {
    decideItem
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new PlanProposalConflictError("already-finished"));

    const state = await regenerate();

    expect(state).toMatchObject({
      status: "conflict",
      message: OUTCOMES.alreadyFinished,
    });
    expect(finishReview).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a refused finish as its own conflict, and never asks again", async () => {
    finishReview.mockRejectedValue(new PlanProposalConflictError("stale"));

    const state = await regenerate();

    expect(state).toMatchObject({
      status: "conflict",
      message: OUTCOMES.conflict,
    });
    expect(generateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("generatePlanProposalAction", () => {
  const today = isoDateInTimezone(new Date(), TIMEZONE);

  beforeEach(() => {
    vi.clearAllMocks();
    createServerUserClientMock.mockResolvedValue({});
    verifyOwnerMock.mockResolvedValue({ id: OWNER_ID });
    createProposalsMock.mockResolvedValue({});
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ userId: OWNER_ID, timezoneName: TIMEZONE }),
    });
    createRollingPlanMock.mockResolvedValue({ getPlanSlice });
    getPlanSlice.mockResolvedValue({ revision: 5, sessions: [] });
    generateMock.mockResolvedValue({
      status: "proposal",
      proposalId: "7c170000-0000-4000-8000-000000000031",
      memoryCandidateCount: 0,
    });
  });

  it("sends the sessions ticked as replaceable, and none by default", async () => {
    const formData = new FormData();
    formData.set("dayCount", "3");
    formData.set("planningNote", "");
    formData.set("idempotencyKey", "start-date-compose-key-0002");
    formData.append("replaceable", KEPT_ID);
    formData.append("replaceable", LOGGED_ID);

    await generatePlanProposalAction(
      INITIAL_PLAN_PROPOSAL_ACTION_STATE,
      formData,
    );
    await compose({});

    expect(generateMock.mock.calls[0][0]).toMatchObject({
      replaceableSessionIds: [KEPT_ID, LOGGED_ID],
    });
    expect(generateMock.mock.calls[1][0]).toMatchObject({
      replaceableSessionIds: [],
    });
  });

  it("refuses a tick that is not a session id", async () => {
    const formData = new FormData();
    formData.set("dayCount", "3");
    formData.set("idempotencyKey", "start-date-compose-key-0003");
    formData.append("replaceable", "r1");

    const state = await generatePlanProposalAction(
      INITIAL_PLAN_PROPOSAL_ACTION_STATE,
      formData,
    );

    expect(state.status).toBe("validation");
    expect(generateMock).not.toHaveBeenCalled();
  });

  function compose(fields: Record<string, string>) {
    const formData = new FormData();
    for (const [name, value] of Object.entries({
      dayCount: "3",
      planningNote: "",
      idempotencyKey: "start-date-compose-key-0001",
      ...fields,
    })) {
      formData.set(name, value);
    }
    return generatePlanProposalAction(
      INITIAL_PLAN_PROPOSAL_ACTION_STATE,
      formData,
    );
  }

  it("plans from the first day the owner chose", async () => {
    const start = shiftIsoDate(today, 4);

    const state = await compose({ startDate: start });

    expect(state.status).toBe("proposal");
    expect(generateMock.mock.calls[0][0]).toMatchObject({
      startDate: start,
      endDate: shiftIsoDate(start, 2),
      dayCount: 3,
    });
    // The plan is read over the days asked about, not from today.
    expect(getPlanSlice).toHaveBeenCalledExactlyOnceWith(
      start,
      shiftIsoDate(start, 2),
    );
  });

  it("plans from today when no first day is sent", async () => {
    await compose({});

    expect(generateMock.mock.calls[0][0]).toMatchObject({
      startDate: today,
      endDate: shiftIsoDate(today, 2),
    });
  });

  it.each([-2, 31])(
    "refuses a first day %i days from today, keeping what was typed",
    async (offset) => {
      const start = shiftIsoDate(today, offset);

      const state = await compose({ startDate: start });

      expect(state).toMatchObject({
        status: "validation",
        message: PLAN_PROPOSAL_COPY.startDateRange,
        draft: { startDate: start, dayCount: "3" },
      });
      expect(generateMock).not.toHaveBeenCalled();
    },
  );
});

function openProposal() {
  const today = isoDateInTimezone(new Date(), TIMEZONE);
  return {
    id: PROPOSAL_ID,
    providerCode: "fixture",
    planningNote: "Short on Thursdays.",
    regenerationFeedback: null,
    content: {},
    startDate: today,
    endDate: shiftIsoDate(today, 2),
    composedAtPlanRevision: 4,
    generationId: GENERATION_ID,
    items: [
      { ordinal: 1, decision: "proposed" },
      { ordinal: 2, decision: "staged" },
      { ordinal: 3, decision: "proposed" },
      { ordinal: 4, decision: "rejected" },
    ],
    decision: null,
    createdAt: `${today}T08:00:00.000Z`,
  };
}

function regenerate(
  overrides: Partial<Record<string, string>> = {},
): ReturnType<typeof regeneratePlanProposalAction> {
  const fields: Record<string, string> = {
    proposalId: PROPOSAL_ID,
    regenerationFeedback: "Less running.",
    idempotencyKey: IDEMPOTENCY_KEY,
    expectedPlanRevision: "4",
    ...overrides,
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return regeneratePlanProposalAction(
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
    formData,
  );
}
