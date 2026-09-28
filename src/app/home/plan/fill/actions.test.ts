import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPlanMock,
  createRepositoryMock,
  generateMock,
  readPlanWindowMock,
} = vi.hoisted(() => ({
  createPlanMock: vi.fn(),
  createRepositoryMock: vi.fn(),
  generateMock: vi.fn(),
  readPlanWindowMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/server/ai/owner", () => ({
  verifyCoachAIOwner: vi.fn().mockResolvedValue({ userId: "owner" }),
}));
vi.mock("../plan-window", () => ({ readPlanWindow: readPlanWindowMock }));
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createPlanMock };
});
vi.mock(
  "@/server/repositories/session-activity-repository",
  async (original) => {
    const actual =
      await original<
        typeof import("@/server/repositories/session-activity-repository")
      >();
    return { ...actual, createSessionActivityRepository: createRepositoryMock };
  },
);
vi.mock("@/server/session-detail/session-activity-generation", () => ({
  generateSessionActivities: generateMock,
}));

import {
  dismissSessionActivitiesAction,
  fillSessionActivitiesAction,
} from "./actions";

import { CoachAIError } from "@/server/ai/errors";
import {
  SessionActivityConflictError,
  type SessionActivityProposalView,
} from "@/server/repositories/session-activity-repository";

const SESSION_ID = "7e000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "5a000000-0000-4000-8000-000000000001";
const KEY = "4f7c2a8e-1b3d-4e5f-9a0b-1c2d3e4f5a6b";

const proposal: SessionActivityProposalView = {
  id: PROPOSAL_ID,
  sessionId: SESSION_ID,
  localDate: "2026-09-29",
  providerCode: "fixture",
  note: null,
  decision: null,
  createdAt: "2026-09-28T12:00:00.000Z",
  content: {
    schemaVersion: "fittip.session-activities.v1",
    summary: "Squat-led lower body day.",
    safetyConsiderations: ["Stop if the knee hurts."],
    activities: [
      {
        personalActivityId: null,
        name: "Goblet squat",
        sport: "Strength",
        instructions: null,
        measurementMode: "sets_reps_load",
        target: { groups: [{ sets: 3, reps: 8 }] },
        rationale: "Keeps the pattern with less load.",
      },
    ],
  },
};

let repository: {
  getProposal: ReturnType<typeof vi.fn>;
  decide: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  readPlanWindowMock.mockResolvedValue({
    today: "2026-09-28",
    lastDate: "2026-10-11",
  });
  createPlanMock.mockResolvedValue({
    getPlanSlice: vi.fn().mockResolvedValue({
      revision: 7,
      sessions: [{ id: SESSION_ID, localDate: "2026-09-29", status: "active" }],
    }),
  });
  repository = {
    getProposal: vi.fn().mockResolvedValue(proposal),
    decide: vi.fn().mockResolvedValue("dismissed"),
  };
  createRepositoryMock.mockResolvedValue(repository);
  generateMock.mockResolvedValue({
    status: "proposal",
    proposalId: PROPOSAL_ID,
  });
});

describe("fillSessionActivitiesAction", () => {
  it("asks about the session as the plan has it and answers the proposal for the editor", async () => {
    const result = await fillSessionActivitiesAction({
      sessionId: SESSION_ID,
      note: "  keep it short\r\n",
      idempotencyKey: KEY,
    });

    // The date and the revision come from the plan, never from the caller.
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        sessionDate: "2026-09-29",
        expectedPlanRevision: 7,
        note: "keep it short",
        idempotencyKey: KEY,
      }),
      { requests: repository },
    );
    expect(result).toEqual({
      status: "proposal",
      proposal: {
        proposalId: PROPOSAL_ID,
        isExample: true,
        summary: "Squat-led lower body day.",
        safetyConsiderations: ["Stop if the knee hurts."],
        activities: [
          {
            personalActivityId: null,
            name: "Goblet squat",
            sport: "Strength",
            instructions: null,
            measurementMode: "sets_reps_load",
            target: { groups: [{ sets: 3, reps: 8 }] },
          },
        ],
        rationales: ["Keeps the pattern with less load."],
      },
    });
  });

  it("refuses a note over 500 characters before anything is asked", async () => {
    const result = await fillSessionActivitiesAction({
      sessionId: SESSION_ID,
      note: "x".repeat(501),
      idempotencyKey: KEY,
    });

    expect(result).toMatchObject({ status: "refused" });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed request and a session not on the plan", async () => {
    await expect(
      fillSessionActivitiesAction({
        sessionId: SESSION_ID,
        note: "",
        idempotencyKey: "short",
      }),
    ).resolves.toMatchObject({ status: "refused" });
    await expect(
      fillSessionActivitiesAction({
        sessionId: "7e000000-0000-4000-8000-000000000099",
        note: "",
        idempotencyKey: KEY,
      }),
    ).resolves.toMatchObject({
      status: "refused",
      message: expect.stringContaining("no longer on your plan"),
    });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("tells a still-running request apart from a failed one", async () => {
    generateMock.mockResolvedValueOnce({ status: "pending" });
    await expect(
      fillSessionActivitiesAction({
        sessionId: SESSION_ID,
        note: "",
        idempotencyKey: KEY,
      }),
    ).resolves.toMatchObject({ status: "pending" });

    generateMock.mockResolvedValueOnce({ status: "failed" });
    await expect(
      fillSessionActivitiesAction({
        sessionId: SESSION_ID,
        note: "",
        idempotencyKey: KEY,
      }),
    ).resolves.toMatchObject({ status: "refused" });
  });

  it("shows only fixed copy for a coaching or database failure", async () => {
    generateMock.mockRejectedValueOnce(new CoachAIError("budget_exhausted"));
    await expect(
      fillSessionActivitiesAction({
        sessionId: SESSION_ID,
        note: "",
        idempotencyKey: KEY,
      }),
    ).resolves.toEqual({
      status: "refused",
      message: "The suggestion limit has been reached.",
    });

    generateMock.mockRejectedValueOnce(
      new SessionActivityConflictError("session-past"),
    );
    await expect(
      fillSessionActivitiesAction({
        sessionId: SESSION_ID,
        note: "",
        idempotencyKey: KEY,
      }),
    ).resolves.toMatchObject({
      message: expect.stringContaining("day has passed"),
    });
  });
});

describe("dismissSessionActivitiesAction", () => {
  it("records the dismissal", async () => {
    await expect(
      dismissSessionActivitiesAction(PROPOSAL_ID),
    ).resolves.toMatchObject({ status: "dismissed" });
    expect(repository.decide).toHaveBeenCalledWith(PROPOSAL_ID, "dismissed");
  });

  it("says a suggestion already saved cannot be dismissed", async () => {
    repository.decide.mockRejectedValueOnce(
      new SessionActivityConflictError("already-decided"),
    );
    await expect(
      dismissSessionActivitiesAction(PROPOSAL_ID),
    ).resolves.toMatchObject({
      status: "refused",
      message: expect.stringContaining("already saved"),
    });
  });

  it("refuses an id that is not one", async () => {
    await expect(dismissSessionActivitiesAction("nope")).resolves.toMatchObject(
      { status: "refused" },
    );
    expect(repository.decide).not.toHaveBeenCalled();
  });
});
