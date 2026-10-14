import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  redirectMock,
  createRoadmapMock,
  createProfileMock,
  createGoalMock,
  createServerUserClientMock,
  verifyOwnerMock,
  generateMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  // No roadmap action redirects. The mock exists so a test can say so, and
  // throws like Next's own would if one ever started to.
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  createRoadmapMock: vi.fn(),
  createProfileMock: vi.fn(),
  createGoalMock: vi.fn(),
  createServerUserClientMock: vi.fn(),
  verifyOwnerMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});
vi.mock("@/server/repositories/goal-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/goal-repository")>();
  return { ...actual, createGoalRepository: createGoalMock };
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
  editRoadmapAction,
  generateRoadmapAction,
  setMilestoneReachedAction,
  setRoadmapReviewedAction,
  writeRoadmapAction,
} from "./actions";
import { INITIAL_ROADMAP_ACTION_STATE } from "./action-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
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
const EDIT_ID = "9f150000-0000-4000-8000-000000000032";
const GOAL_ID = "9f150000-0000-4000-8000-000000000020";
const TIMEZONE = "Europe/Berlin";
const OUTCOMES = ROADMAP_CONTROL_COPY.outcomes;

const acceptProposal = vi.fn();
const declineProposal = vi.fn();
const editProposal = vi.fn();
const getProposal = vi.fn();
const getHead = vi.fn();
const listGoals = vi.fn();
const setMilestoneReached = vi.fn();
const setReviewed = vi.fn();
const writeRoadmap = vi.fn();

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
    editProposal.mockResolvedValue(EDIT_ID);
    getProposal.mockResolvedValue(sourceProposal());
    listGoals.mockResolvedValue({ revision: 4, goals: [goal()] });
    createGoalMock.mockResolvedValue({ list: listGoals });
    createRoadmapMock.mockResolvedValue({
      getHead,
      acceptProposal,
      declineProposal,
      editProposal,
      getProposal,
      setMilestoneReached,
      setReviewed,
      writeRoadmap,
    });
    writeRoadmap.mockResolvedValue({
      proposalId: PROPOSAL_ID,
      versionId: VERSION_ID,
      headRevision: 3,
      result: "accepted",
    });
    setMilestoneReached.mockResolvedValue(undefined);
    setReviewed.mockResolvedValue(undefined);
    generateMock.mockResolvedValue({
      status: "proposal",
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
  });

  describe("accept", () => {
    // A write that lands invalidates the route and reports that it landed; the
    // client reloads the document on that status. No server redirect is used,
    // for the browser evidence recorded in `use-roadmap-write.ts`.
    it("accepts against the head the owner read, and invalidates the route", async () => {
      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(result.status).toBe("accepted");
      expect(acceptProposal).toHaveBeenCalledWith(PROPOSAL_ID, 2);
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
      expect(redirectMock).not.toHaveBeenCalled();
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

    // Another roadmap was accepted since this one was proposed. Reloading
    // would not help, so the sentence says what will.
    it("tells the owner to decline a proposal made under an earlier roadmap", async () => {
      acceptProposal.mockRejectedValue(
        new RoadmapConflictError("roadmap-moved"),
      );

      const result = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );

      expect(result).toMatchObject({
        status: "conflict",
        message: OUTCOMES.roadmapMoved,
      });
      expect(result.message).toMatch(/Decline it/);
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

  // ADR-026. The form says which milestone and which way; nothing else.
  describe("milestone", () => {
    const mark = (values: Record<string, string>) =>
      setMilestoneReachedAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          versionId: VERSION_ID,
          phaseIndex: "0",
          milestoneIndex: "1",
          reached: "true",
          ...values,
        }),
      );

    it("marks a milestone reached, says nothing, and invalidates the route", async () => {
      const result = await mark({});

      expect(result).toMatchObject({ status: "marked", message: "" });
      expect(setMilestoneReached).toHaveBeenCalledWith({
        versionId: VERSION_ID,
        phaseIndex: 0,
        milestoneIndex: 1,
        reached: true,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
    });

    it("takes a mark back for anything but the word true", async () => {
      await mark({ reached: "false" });
      await mark({ reached: "" });

      expect(
        setMilestoneReached.mock.calls.map(([input]) => input.reached),
      ).toEqual([false, false]);
    });

    it.each([
      ["a malformed version", { versionId: "not-a-uuid" }],
      ["a seventh phase", { phaseIndex: "6" }],
      ["a fourth milestone", { milestoneIndex: "3" }],
      ["a negative place", { phaseIndex: "-1" }],
      ["a place that is not a number", { milestoneIndex: "1.5" }],
    ])("refuses %s before touching the database", async (_name, values) => {
      const result = await mark(values);

      expect(result).toMatchObject({
        status: "validation",
        message: OUTCOMES.milestoneUnavailable,
      });
      expect(setMilestoneReached).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    // The database's one refusal: not this owner's roadmap in force, or no
    // such milestone. The page it was sent from is out of date.
    it("says a milestone of a roadmap that moved on could not be changed", async () => {
      setMilestoneReached.mockRejectedValue(
        new RoadmapConflictError("not-available"),
      );

      const result = await mark({});

      expect(result).toMatchObject({
        status: "conflict",
        message: OUTCOMES.milestoneUnavailable,
      });
      expect(result.message).not.toMatch(/proposal/i);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("sends an expired session to sign in", async () => {
      setMilestoneReached.mockRejectedValue(new RoadmapAuthenticationError());

      const result = await mark({});

      expect(result).toMatchObject({
        status: "session",
        message: OUTCOMES.sessionEnded,
      });
    });
  });

  // ADR-028. A change request is a first request that says so, with a note.
  describe("change with coach", () => {
    const today = isoDateInTimezone(new Date(), TIMEZONE);
    const change = (values: Record<string, string>) =>
      generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          startDate: today,
          endDate: addDays(today, 84),
          planningNote: "Make the second phase easier.",
          idempotencyKey: "m3-15f-generate-key-0001",
          changeRoadmap: "true",
          ...values,
        }),
      );

    it("asks for the roadmap in force to be changed, naming none", async () => {
      const result = await change({});

      expect(result.status).toBe("proposal");
      const [input] = generateMock.mock.calls[0] as [Record<string, unknown>];
      expect(input).toMatchObject({
        changeRoadmap: true,
        planningNote: "Make the second phase easier.",
        previousProposalId: null,
      });
      expect(Object.keys(input).filter((key) => /version/i.test(key))).toEqual(
        [],
      );
    });

    it("sends no flag on an ordinary request", async () => {
      await change({ changeRoadmap: "" });

      const [input] = generateMock.mock.calls[0] as [Record<string, unknown>];
      expect("changeRoadmap" in input).toBe(false);
    });

    it("refuses a change that does not say what should change", async () => {
      const result = await change({ planningNote: "   " });

      expect(result).toMatchObject({
        status: "validation",
        message: OUTCOMES.changeNoteRequired,
      });
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("refuses a change when no roadmap is in force", async () => {
      getHead.mockResolvedValue({ revision: 0, currentVersionId: null });

      const result = await change({});

      expect(result).toMatchObject({
        status: "validation",
        message: OUTCOMES.changeNothingToChange,
      });
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("refuses a change that is also a regeneration", async () => {
      const result = await change({
        previousProposalId: PROPOSAL_ID,
        regenerationFeedback: "Start easier.",
      });

      expect(result.status).toBe("validation");
      expect(generateMock).not.toHaveBeenCalled();
    });
  });

  // ADR-027. The form says which roadmap and which phase; that the phase has
  // ended is the database's to decide.
  describe("review", () => {
    const review = (values: Record<string, string>) =>
      setRoadmapReviewedAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ versionId: VERSION_ID, phaseIndex: "1", ...values }),
      );

    it("marks the roadmap reviewed and invalidates it and the Plan", async () => {
      const result = await review({});

      expect(result).toMatchObject({ status: "reviewed", message: "" });
      expect(setReviewed).toHaveBeenCalledWith({
        versionId: VERSION_ID,
        phaseIndex: 1,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
      // The Plan's Roadmap chip carries the dot this clears.
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan");
    });

    it.each([
      ["a malformed version", { versionId: "not-a-uuid" }],
      ["a seventh phase", { phaseIndex: "6" }],
      ["a phase that is not a number", { phaseIndex: "first" }],
    ])("refuses %s before touching the database", async (_name, values) => {
      const result = await review(values);

      expect(result).toMatchObject({
        status: "validation",
        message: OUTCOMES.reviewUnavailable,
      });
      expect(setReviewed).not.toHaveBeenCalled();
    });

    it("says a review the database refuses could not be marked", async () => {
      setReviewed.mockRejectedValue(new RoadmapConflictError("not-available"));

      const result = await review({});

      expect(result).toMatchObject({
        status: "conflict",
        message: OUTCOMES.reviewUnavailable,
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("decline", () => {
    it("declines and invalidates the route", async () => {
      const result = await declineRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID }),
      );

      expect(result.status).toBe("declined");
      expect(declineProposal).toHaveBeenCalledWith(PROPOSAL_ID);
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
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
    // Owner-local, as the action derives it. A UTC date disagreed with it for
    // the two hours after midnight in Berlin, every night.
    const today = isoDateInTimezone(new Date(), TIMEZONE);
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
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
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

    it("starts on the day the owner chose, and counts the weeks from it", async () => {
      const startDate = addDays(today, 30);
      // Fifty-two weeks from the first day, which is past fifty-two from today.
      const farEnd = addDays(startDate, 365);

      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          startDate,
          endDate: farEnd,
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.status).toBe("proposal");
      expect(generateMock.mock.calls[0][0]).toMatchObject({
        startDate,
        endDate: farEnd,
      });
    });

    it.each([-2, 31])(
      "refuses a first day %i days from today",
      async (offset) => {
        const startDate = addDays(today, offset);

        const result = await generateRoadmapAction(
          INITIAL_ROADMAP_ACTION_STATE,
          form({
            startDate,
            endDate: addDays(startDate, 84),
            idempotencyKey: "m3-15f-generate-key-0001",
          }),
        );

        expect(result.status).toBe("validation");
        expect(generateMock).not.toHaveBeenCalled();
      },
    );

    it("refuses an end under four weeks from a later first day", async () => {
      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          startDate: addDays(today, 10),
          // Four weeks from today, but under three from the first day.
          endDate: addDays(today, 28),
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result.status).toBe("validation");
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("says so when a regeneration's first day has passed", async () => {
      const startDate = addDays(today, -1);

      const result = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          startDate,
          endDate: addDays(startDate, 84),
          previousProposalId: PROPOSAL_ID,
          regenerationFeedback: "Less running.",
          idempotencyKey: "m3-15f-generate-key-0001",
        }),
      );

      expect(result).toMatchObject({
        status: "validation",
        message: OUTCOMES.regenerationDatesPassed,
      });
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
        startDate: "",
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

      // The running attempt will never report back to this screen, so the
      // reply asks for the one thing that settles it rather than leaving the
      // in-flight sentence on a tab that cannot update.
      expect(result).toMatchObject({
        status: "pending",
        message: OUTCOMES.pendingElsewhere,
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

  // An edit is the one write whose payload is not a set of fields, so what is
  // proved here is that the JSON it carries is treated as a claim to be checked
  // rather than as content to be stored.
  describe("edit", () => {
    it("saves a valid edit as a new proposal beside its source", async () => {
      const result = await editRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          proposalId: PROPOSAL_ID,
          content: JSON.stringify(editedContent({ title: "My own wording" })),
        }),
      );

      expect(result.status).toBe("edited");
      expect(redirectMock).not.toHaveBeenCalled();
      expect(editProposal.mock.calls[0][0]).toBe(PROPOSAL_ID);
      expect(editProposal.mock.calls[0][1]).toMatchObject({
        title: "My own wording",
        schemaVersion: "fittip.roadmap.v4",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
    });

    // The horizon belongs to the proposal being edited, not to the form. An
    // edit that moved it would widen a request the owner already made.
    it("refuses an edit that moves the horizon, and writes nothing", async () => {
      const result = await editRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          proposalId: PROPOSAL_ID,
          content: JSON.stringify(
            editedContent({ endDate: addDays(SOURCE_START, 200) }),
          ),
        }),
      );

      expect(result.status).toBe("validation");
      expect(editProposal).not.toHaveBeenCalled();
    });

    it("refuses a body that is not a roadmap at all", async () => {
      const result = await editRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, content: "not json" }),
      );

      expect(result.status).toBe("validation");
      expect(result.message).toBe(OUTCOMES.checkDetails);
      expect(editProposal).not.toHaveBeenCalled();
    });

    it("refuses an edit of a proposal that is no longer there", async () => {
      getProposal.mockResolvedValue(null);

      const result = await editRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          proposalId: PROPOSAL_ID,
          content: JSON.stringify(editedContent({})),
        }),
      );

      expect(result).toMatchObject({
        status: "conflict",
        message: OUTCOMES.notAvailable,
      });
    });
  });

  // ADR-029. The owner's today is the confirmed zone's; the head is the page's.
  describe("write by hand", () => {
    const today = isoDateInTimezone(new Date(), TIMEZONE);
    const written = (overrides: Record<string, unknown> = {}) => {
      const content = roadmapContent();
      const start = (overrides.startDate as string | undefined) ?? today;
      const end =
        (overrides.endDate as string | undefined) ?? addDays(start, 84);
      return JSON.stringify({
        ...content,
        startDate: start,
        endDate: end,
        phases: [
          {
            ...content.phases[0],
            startDate: start,
            endDate: end,
            milestones: [],
          },
        ],
        ...overrides,
      });
    };

    it("puts a valid roadmap in force against the page's head", async () => {
      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: written(), expectedHeadRevision: "2" }),
      );

      expect(result).toMatchObject({
        status: "written",
        message: OUTCOMES.written,
      });
      expect(writeRoadmap.mock.calls[0][1]).toBe(2);
      expect(writeRoadmap.mock.calls[0][0]).toMatchObject({
        schemaVersion: "fittip.roadmap.v4",
        startDate: today,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/roadmap");
      expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan");
    });

    it("needs no summary", async () => {
      const content = JSON.parse(written());
      delete content.summary;

      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: JSON.stringify(content), expectedHeadRevision: "0" }),
      );

      expect(result.status).toBe("written");
      expect("summary" in writeRoadmap.mock.calls[0][0]).toBe(false);
    });

    it.each([
      ["starts in the past", { startDate: addDays(today, -3) }],
      ["starts more than 30 days ahead", { startDate: addDays(today, 31) }],
      ["is shorter than four weeks", { endDate: addDays(today, 20) }],
      ["is longer than fifty-two weeks", { endDate: addDays(today, 400) }],
      ["names no start", { startDate: "", endDate: addDays(today, 84) }],
    ])(
      "refuses a roadmap that %s, and writes nothing",
      async (_name, dates) => {
        const result = await writeRoadmapAction(
          INITIAL_ROADMAP_ACTION_STATE,
          form({ content: written(dates), expectedHeadRevision: "0" }),
        );

        expect(result).toMatchObject({
          status: "validation",
          message: ROADMAP_CONTROL_COPY.writeRejections.dates,
        });
        expect(writeRoadmap).not.toHaveBeenCalled();
      },
    );

    it("refuses a phase with no goal in the writer's own words", async () => {
      const content = JSON.parse(written());
      content.phases[0].goalAttention = [];

      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: JSON.stringify(content), expectedHeadRevision: "0" }),
      );

      expect(result.message).toBe(
        ROADMAP_CONTROL_COPY.writeRejections.business_rule,
      );
      expect(writeRoadmap).not.toHaveBeenCalled();
    });

    it("refuses a goal that is not one of the owner's active goals", async () => {
      const content = JSON.parse(written());
      content.phases[0].goalAttention[0].goalId =
        "9f150000-0000-4000-8000-0000000000ff";

      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: JSON.stringify(content), expectedHeadRevision: "0" }),
      );

      expect(result.message).toBe(
        ROADMAP_CONTROL_COPY.writeRejections.unowned_goal_reference,
      );
    });

    it("refuses a missing head rather than guessing one", async () => {
      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: written() }),
      );

      expect(result.status).toBe("validation");
      expect(writeRoadmap).not.toHaveBeenCalled();
    });

    it("says a roadmap accepted elsewhere moved the page on", async () => {
      writeRoadmap.mockRejectedValue(new RoadmapConflictError("stale"));

      const result = await writeRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ content: written(), expectedHeadRevision: "1" }),
      );

      expect(result).toMatchObject({
        status: "conflict",
        message: OUTCOMES.stale,
      });
    });
  });

  // A write that lands renders over the tree its own reply carried, so the
  // approved sentence is read on the screen the write produced. These four are
  // the copy the surface promises; an empty message would leave a successful
  // write saying nothing at all.
  describe("what a landed write says", () => {
    const endDate = addDays(new Date().toISOString().slice(0, 10), 84);

    it("names the outcome of every successful write", async () => {
      const generated = await generateRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ endDate, idempotencyKey: "m3-15f-generate-key-0001" }),
      );
      const accepted = await acceptRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID, expectedHeadRevision: "2" }),
      );
      const declined = await declineRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({ proposalId: PROPOSAL_ID }),
      );
      const edited = await editRoadmapAction(
        INITIAL_ROADMAP_ACTION_STATE,
        form({
          proposalId: PROPOSAL_ID,
          content: JSON.stringify(editedContent({})),
        }),
      );

      expect(generated).toMatchObject({
        status: "proposal",
        message: OUTCOMES.proposalReady,
      });
      expect(accepted).toMatchObject({
        status: "accepted",
        message: OUTCOMES.accepted,
      });
      expect(declined).toMatchObject({
        status: "declined",
        message: OUTCOMES.declined,
      });
      expect(edited).toMatchObject({
        status: "edited",
        message: OUTCOMES.edited,
      });
    });
  });
});

const SOURCE_START = new Date().toISOString().slice(0, 10);
const SOURCE_END = addDays(SOURCE_START, 84);

function roadmapContent() {
  return {
    schemaVersion: "fittip.roadmap.v4" as const,
    title: "Toward the hilly half",
    summary: "Base first, then sharpen into the event.",
    startDate: SOURCE_START,
    endDate: SOURCE_END,
    phases: [
      {
        title: "Base",
        focus: "Easy volume, one longer run a week, nothing sharp.",
        startDate: SOURCE_START,
        endDate: SOURCE_END,
        goalAttention: [
          {
            goalId: GOAL_ID,
            level: "primary" as const,
          },
        ],
        milestones: [
          {
            title: "Four steady weeks",
            observableCriterion: "Four consecutive weeks completed as planned.",
            targetDate: SOURCE_END,
            goalIds: [GOAL_ID],
          },
        ],
      },
    ],
  };
}

function editedContent(overrides: Record<string, unknown>) {
  return { ...roadmapContent(), ...overrides };
}

function sourceProposal() {
  return {
    id: PROPOSAL_ID,
    origin: "ai_initial" as const,
    sourceProposalId: null,
    providerCode: "fixture",
    content: roadmapContent(),
    planningNote: null,
    regenerationFeedback: null,
    regenerationNumber: 0,
    startDate: SOURCE_START,
    endDate: SOURCE_END,
    decision: null,
    createdAt: "2026-09-16T09:00:00.000Z",
  };
}

function goal() {
  return {
    id: GOAL_ID,
    title: "Hilly half marathon",
    sports: ["Running"],
    priorityTier: "core" as const,
    targetDate: addDays(SOURCE_START, 70),
    status: "active" as const,
  };
}

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}
