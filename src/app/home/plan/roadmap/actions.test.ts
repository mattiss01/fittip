import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  createRoadmapMock,
  createProfileMock,
  createServerUserClientMock,
  verifyOwnerMock,
  generateMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  createRoadmapMock: vi.fn(),
  createProfileMock: vi.fn(),
  createServerUserClientMock: vi.fn(),
  verifyOwnerMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/ai/owner", async (original) => {
  const actual = await original<typeof import("@/server/ai/owner")>();
  return { ...actual, verifyCoachAIOwner: verifyOwnerMock };
});
vi.mock("@/server/roadmap/roadmap-generation", () => ({
  generateRoadmapProposal: generateMock,
}));

import {
  acceptRoadmapAction,
  declineRoadmapAction,
  generateRoadmapAction,
} from "./actions";
import { INITIAL_ROADMAP_ACTION_STATE } from "./action-state";

import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import { CoachAIContextBelowMinimumError } from "@/server/ai/context";
import {
  RoadmapAuthenticationError,
  RoadmapConflictError,
} from "@/server/repositories/roadmap-repository";
import { addDays } from "@/server/roadmap/roadmap-records";

/**
 * The Server Actions, at their own boundary.
 *
 * What is proved here is what a screen and an attacker can observe: which input
 * is refused before anything is written, which owner-derived value is used
 * instead of the one the form carried, what each database conflict says to the
 * owner, and that a write that lands invalidates the route it changed.
 *
 * `generateRoadmapProposal` is stubbed. Which coach it resolves and what it
 * records are proved against the real composition root in
 * `roadmap-generation.test.ts`; repeating it here would test the stub.
 */

const OWNER_ID = "9f150000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "9f150000-0000-4000-8000-000000000030";
const VERSION_ID = "9f150000-0000-4000-8000-000000000031";
const TIMEZONE = "Europe/Berlin";
const OUTCOMES = ROADMAP_CONTROL_COPY.outcomes;

const acceptProposal = vi.fn();
const declineProposal = vi.fn();
const getHead = vi.fn();

describe("roadmap server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerUserClientMock.mockResolvedValue({});
    verifyOwnerMock.mockResolvedValue({ id: OWNER_ID });
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ userId: OWNER_ID, timezoneName: TIMEZONE }),
    });
    getHead.mockResolvedValue({ revision: 2, currentVersionId: VERSION_ID });
    acceptProposal.mockResolvedValue({
      proposalId: PROPOSAL_ID,
      versionId: VERSION_ID,
      headRevision: 3,
      result: "accepted",
    });
    declineProposal.mockResolvedValue(undefined);
    createRoadmapMock.mockResolvedValue({
      getHead,
      acceptProposal,
      declineProposal,
    });
    generateMock.mockResolvedValue({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
  });

  describe("accept", () => {
    it("accepts against the head the owner read, and invalidates the route", async () => {
      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(acceptProposal).toHaveBeenCalledWith(PROPOSAL_ID, 2);
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
      expect(result).toMatchObject({
        status: "accepted",
        message: OUTCOMES.accepted,
        proposalId: PROPOSAL_ID,
      });
    });

    // A head that moved is the case this expectation exists for. The refusal
    // reaches the owner as something to do, not as a database message.
    it("reports a stale head as something to look at again", async () => {
      acceptProposal.mockRejectedValue(new RoadmapConflictError("stale"));

      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(result.status).toBe("conflict");
      expect(result.message).toBe(OUTCOMES.stale);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("names a source that changed rather than blaming the owner", async () => {
      acceptProposal.mockRejectedValue(
        new RoadmapConflictError("sources-changed"),
      );

      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(result.message).toBe(OUTCOMES.sourcesChanged);
    });

    // The id is a form field, so it is parsed rather than trusted. A malformed
    // one never reaches the database.
    it("refuses a malformed proposal id before touching the database", async () => {
      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: "not-a-uuid", expectedHeadRevision: "2" }),
      );

      expect(result.status).toBe("validation");
      expect(acceptProposal).not.toHaveBeenCalled();
    });

    it("refuses a negative expected head revision", async () => {
      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "-1" }),
      );

      expect(result.status).toBe("validation");
      expect(acceptProposal).not.toHaveBeenCalled();
    });

    it("sends an expired session to sign in rather than reporting a failure", async () => {
      acceptProposal.mockRejectedValue(new RoadmapAuthenticationError());

      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(result).toMatchObject({
        status: "session",
        message: OUTCOMES.sessionEnded,
      });
    });
  });

  describe("decline", () => {
    it("declines and invalidates the route", async () => {
      const result = await declineRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID }),
      );

      expect(declineProposal).toHaveBeenCalledWith(PROPOSAL_ID);
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
      expect(result).toMatchObject({
        status: "declined",
        message: OUTCOMES.declined,
        proposalId: PROPOSAL_ID,
      });
    });

    it("reports an already-decided proposal as decided", async () => {
      declineProposal.mockRejectedValue(
        new RoadmapConflictError("already-decided"),
      );

      const result = await declineRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID }),
      );

      expect(result.message).toBe(OUTCOMES.alreadyDecided);
    });
  });

  describe("generate", () => {
    const today = new Date().toISOString().slice(0, 10);
    const endDate = addDays(today, 84);

    it("derives today from the owner's zone, not from the form", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate,
          planningNote: "",
          idempotencyKey: "m3-15f-generate-key-0001",
          // A field the action does not read. If it ever did, this value would
          // move the horizon every later check is measured against.
          today: "2030-01-01",
        }),
      );

      expect(result.status).toBe("proposal");
      expect(generateMock.mock.calls[0][0]).toMatchObject({
        startDate: today,
        endDate,
        expectedHeadRevision: 2,
        previousProposalId: null,
        regenerationFeedback: null,
      });
    });

    // ADR-014 decision 6: feedback is required on a regeneration and belongs
    // only to one. Both halves are checked, because either direction alone
    // would let one of the two shapes through.
    it("requires feedback on a regeneration", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate,
          previousProposalId: PROPOSAL_ID,
          regenerationFeedback: "   ",
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.status).toBe("validation");
      expect(result.message).toBe(OUTCOMES.feedbackRequired);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("refuses feedback on a first request", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate,
          regenerationFeedback: "Less volume.",
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.message).toBe(OUTCOMES.feedbackWithoutRegeneration);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("refuses an unusable idempotency key rather than minting one", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ endDate, idempotencyKey: "short" }),
      );

      expect(result.message).toBe(OUTCOMES.requestUnidentified);
      expect(generateMock).not.toHaveBeenCalled();
    });

    // Decision 1's horizon bounds, checked here as well as in the database.
    it("refuses a horizon outside four to fifty-two weeks", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate: addDays(today, 3),
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.status).toBe("validation");
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("keeps what was typed when it refuses, so nothing has to be retyped", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate: addDays(today, 3),
          planningNote: "Tuesdays are impossible.",
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.draft).toEqual({
        endDate: addDays(today, 3),
        planningNote: "Tuesdays are impossible.",
        regenerationFeedback: "",
      });
    });

    it("refuses a note longer than the accepted limit instead of truncating it", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate,
          planningNote: "x".repeat(1001),
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.message).toBe(OUTCOMES.noteTooLong);
      expect(generateMock).not.toHaveBeenCalled();
    });

    // The one context minimum this surface can hit. Naming the time zone is the
    // difference between a refusal the owner can act on and one they cannot.
    it("names the missing time zone rather than the coach", async () => {
      generateMock.mockRejectedValue(
        new CoachAIContextBelowMinimumError(["resolved_timezone"]),
      );

      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ endDate, idempotencyKey: "m3-15f-generate-key-0001" }),
      );

      expect(result.message).toBe(OUTCOMES.timezoneRequired);
    });

    it("reports a same-key attempt already in flight without retrying it", async () => {
      generateMock.mockResolvedValue({ status: "pending" });

      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ endDate, idempotencyKey: "m3-15f-generate-key-0001" }),
      );

      expect(result).toMatchObject({
        status: "pending",
        message: ROADMAP_CONTROL_COPY.pending,
      });
      expect(generateMock).toHaveBeenCalledTimes(1);
    });

    it("reports the regeneration ceiling in its own words", async () => {
      generateMock.mockRejectedValue(
        new RoadmapConflictError("regeneration-cap"),
      );

      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          endDate,
          previousProposalId: PROPOSAL_ID,
          regenerationFeedback: "Less volume.",
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result).toMatchObject({
        status: "cap-reached",
        message: ROADMAP_CONTROL_COPY.regenerationCapReached,
      });
    });
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}
