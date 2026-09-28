import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceMock, createSpendLedgerMock, propose } = vi.hoisted(
  () => ({
    createServiceMock: vi.fn(),
    createSpendLedgerMock: vi.fn(),
    propose: vi.fn(),
  }),
);

vi.mock("@/server/ai/composition", () => ({
  createSessionActivitiesCoachAIService: createServiceMock,
}));
vi.mock("@/server/repositories/ai-spend-repository", () => ({
  createAISpendRepository: createSpendLedgerMock,
}));

import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { SessionActivityRepository } from "@/server/repositories/session-activity-repository";
import { generateSessionActivities } from "@/server/session-detail/session-activity-generation";

/**
 * The order of the boundaries and what each failure leaves behind. The coach
 * itself is `session-activities-service.test.ts`'s subject; here the
 * composition is a stub so the claim, the finish and the spend ledger can be
 * observed.
 */

const OWNER = { id: "9f000000-0000-4000-8000-000000000001" } as CoachAIOwner;
const SESSION_ID = "5d000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "5d000000-0000-4000-8000-0000000000e1";
const LEDGER = { reserve: vi.fn(), settle: vi.fn() };
const PROPOSAL = {
  schemaVersion: "fittip.session-activities.v1",
  summary: "Squats, then lunges.",
  activities: [],
};

const requests = {
  beginGeneration: vi.fn(),
  finishGenerationWithProposal: vi.fn(),
  finishGenerationAsFailed: vi.fn(),
};

function input() {
  return {
    owner: OWNER,
    sessionId: SESSION_ID,
    sessionDate: "2026-10-07",
    expectedPlanRevision: 12,
    note: "Only 45 minutes.",
    idempotencyKey: "fill-key-000000000000001",
  };
}

function generate() {
  return generateSessionActivities(input(), {
    requests: requests as unknown as SessionActivityRepository,
  });
}

describe("generateSessionActivities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSpendLedgerMock.mockResolvedValue(LEDGER);
    createServiceMock.mockReturnValue({
      service: { propose },
      binding: {
        providerCode: "fixture",
        modelCode: "fixture-corpus-v1",
        rateCard: { version: "fixture-no-spend" },
      },
    });
    requests.beginGeneration.mockResolvedValue({
      generationId: "g1",
      completionToken: "t1",
      state: "claimed",
      proposalId: null,
    });
    requests.finishGenerationWithProposal.mockResolvedValue(PROPOSAL_ID);
    requests.finishGenerationAsFailed.mockResolvedValue(undefined);
    propose.mockResolvedValue({
      proposal: PROPOSAL,
      spendReservationId: null,
      sources: [{ kind: "plan_session", recordId: SESSION_ID }],
    });
  });

  it("claims, asks the coach about that session's day, and records the list with its sources", async () => {
    await expect(generate()).resolves.toEqual({
      status: "proposal",
      proposalId: PROPOSAL_ID,
    });

    expect(requests.beginGeneration).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: "fill-key-000000000000001",
      requestFingerprint: `session-activities.v1:${SESSION_ID}:2026-10-07:12:16`,
      sessionId: SESSION_ID,
      expectedPlanRevision: 12,
      note: "Only 45 minutes.",
    });
    expect(createServiceMock).toHaveBeenCalledExactlyOnceWith({
      owner: OWNER,
      sessionId: SESSION_ID,
      spendLedger: LEDGER,
    });
    expect(propose.mock.calls[0][0].compose).toEqual({
      horizonStartDate: "2026-10-07",
      horizonEndDate: "2026-10-07",
      planningNote: "Only 45 minutes.",
      regenerationFeedback: null,
      previousProposal: null,
      sessionId: SESSION_ID,
    });
    expect(requests.finishGenerationWithProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        completionToken: "t1",
        schemaVersion: "fittip.session-activities.v1",
        providerCode: "fixture",
        spendReservationId: null,
        note: "Only 45 minutes.",
        content: PROPOSAL,
        sources: [{ kind: "plan_session", recordId: SESSION_ID }],
      }),
    );
    expect(requests.beginGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      propose.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["completed", { status: "proposal", proposalId: PROPOSAL_ID }],
    ["failed", { status: "failed" }],
    ["pending", { status: "pending" }],
  ] as const)(
    "answers a %s replay without calling the coach",
    async (state, expected) => {
      requests.beginGeneration.mockResolvedValue({
        generationId: "g1",
        completionToken: "t1",
        state,
        proposalId: state === "completed" ? PROPOSAL_ID : null,
      });

      await expect(generate()).resolves.toEqual(expected);
      expect(createServiceMock).not.toHaveBeenCalled();
      expect(propose).not.toHaveBeenCalled();
    },
  );

  it("closes the claim with the coach's code when the coach fails", async () => {
    propose.mockRejectedValue(new CoachAIError("output_invalid"));

    await expect(generate()).rejects.toThrow(CoachAIError);
    expect(requests.finishGenerationAsFailed).toHaveBeenCalledExactlyOnceWith(
      "t1",
      "output_invalid",
    );
    expect(requests.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  it("closes the claim when the coach cannot even be composed", async () => {
    createServiceMock.mockImplementation(() => {
      throw new CoachAIError("not_enabled");
    });

    await expect(generate()).rejects.toThrow(CoachAIError);
    expect(requests.finishGenerationAsFailed).toHaveBeenCalledExactlyOnceWith(
      "t1",
      "not_enabled",
    );
  });
});
