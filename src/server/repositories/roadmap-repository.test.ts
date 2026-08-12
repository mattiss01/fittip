import { describe, expect, it, vi } from "vitest";

import {
  RoadmapAuthenticationError,
  RoadmapConflictError,
  RoadmapPersistenceError,
  RoadmapRepository,
} from "@/server/repositories/roadmap-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const FIRST_PROPOSAL = "00000000-0000-4000-8000-000000000010";
const SECOND_PROPOSAL = "00000000-0000-4000-8000-000000000011";

describe("RoadmapRepository", () => {
  it("keeps the declined proposal as the regeneration predecessor", async () => {
    // The state right after a decline: the proposal is decided, so it is no
    // longer open, and it is the only thing a regeneration may name.
    const { repository, eq } = readingProposals([
      proposalRow(SECOND_PROPOSAL, { decision: "rejected" }),
      proposalRow(FIRST_PROPOSAL, { decision: "accepted" }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toMatchObject({
      open: null,
      declinedPredecessor: {
        id: SECOND_PROPOSAL,
        decision: "rejected",
        endDate: "2026-11-02",
        planningNote: "Only 45 minutes on weekdays.",
        regenerationNumber: 1,
      },
    });
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("offers no predecessor while a proposal is still awaiting a decision", async () => {
    const { repository } = readingProposals([
      proposalRow(SECOND_PROPOSAL, { decision: null }),
      proposalRow(FIRST_PROPOSAL, { decision: "rejected" }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toMatchObject({
      open: { id: SECOND_PROPOSAL },
      declinedPredecessor: null,
    });
  });

  // An edit does not decide its source, so nothing but this keeps a superseded
  // draft from reappearing as an open proposal after its edit is accepted.
  it("treats a proposal an edit came from as history, not as open", async () => {
    const { repository } = readingProposals([
      {
        ...proposalRow(SECOND_PROPOSAL, { decision: "accepted" }),
        origin: "owner_edit",
        source_proposal_id: FIRST_PROPOSAL,
      },
      proposalRow(FIRST_PROPOSAL, { decision: null }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toEqual({
      open: null,
      declinedPredecessor: null,
    });
  });

  it("offers no predecessor once a proposal has been accepted", async () => {
    const { repository } = readingProposals([
      proposalRow(SECOND_PROPOSAL, { decision: "accepted" }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toEqual({
      open: null,
      declinedPredecessor: null,
    });
  });

  it("declines through the approved transaction function", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { proposal_id: SECOND_PROPOSAL, result: "rejected" },
      error: null,
    });
    const repository = new RoadmapRepository(client({ rpc }));

    await repository.declineProposal(SECOND_PROPOSAL);

    expect(rpc).toHaveBeenCalledWith("apply_roadmap_proposal_change", {
      p_operation: "reject",
      p_proposal_id: SECOND_PROPOSAL,
    });
  });

  it("sends no argument for the owner text a request does not carry", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generation_id: "00000000-0000-4000-8000-000000000020",
        completion_token: "00000000-0000-4000-8000-000000000021",
        state: "pending",
        regeneration_number: 0,
        proposal_id: null,
      },
      error: null,
    });
    const repository = new RoadmapRepository(client({ rpc }));

    await repository.beginGeneration({
      idempotencyKey: "rk_0123456789abcdef",
      requestFingerprint: "roadmap.v2:2026-08-10:2026-11-02:0:initial:0:0",
      startDate: "2026-08-10",
      endDate: "2026-11-02",
      expectedHeadRevision: 0,
      planningNote: null,
      previousProposalId: null,
      regenerationFeedback: null,
    });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args)).not.toContain("p_planning_note");
    expect(Object.keys(args)).not.toContain("p_previous_proposal_id");
    expect(Object.keys(args)).not.toContain("p_regeneration_feedback");
  });

  it.each([
    ["PT429", "That proposal has already been decided.", "regeneration-cap"],
    ["PT409", "That proposal has already been decided.", "already-decided"],
    [
      "PT409",
      "Decline that proposal before asking for another.",
      "already-decided",
    ],
    ["PT409", "That proposal is no longer available.", "not-available"],
    ["PT409", "Your goals changed since this was prepared.", "sources-changed"],
    ["PT409", "Your roadmap changed. Reload and try again.", "stale"],
  ])(
    "maps %s to a reason the screen can act on",
    async (code, message, reason) => {
      const repository = new RoadmapRepository(
        client({
          rpc: vi
            .fn()
            .mockResolvedValue({ data: null, error: { code, message } }),
        }),
      );

      await expect(
        repository.acceptProposal(SECOND_PROPOSAL, 0),
      ).rejects.toMatchObject({ name: "RoadmapConflictError", reason });
    },
  );

  it("reveals nothing about a database failure", async () => {
    const repository = new RoadmapRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "23514",
            message:
              'new row for relation "roadmap_proposals" violates check constraint "roadmap_proposals_content_shape"',
          },
        }),
      }),
    );

    const failure = await repository
      .acceptProposal(SECOND_PROPOSAL, 0)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RoadmapPersistenceError);
    expect(failure).not.toBeInstanceOf(RoadmapConflictError);
    expect((failure as Error).message).toBe("The roadmap could not be saved.");
  });

  it("does not reach a transaction function for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new RoadmapRepository(
      client({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: null },
            error: new Error("no session"),
          }),
        },
        rpc,
      }),
    );

    await expect(repository.declineProposal(SECOND_PROPOSAL)).rejects.toThrow(
      RoadmapAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

function readingProposals(rows: ReturnType<typeof proposalRow>[]) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (table !== "roadmap_proposals") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { select };
  });

  return { repository: new RoadmapRepository(client({ from })), eq, order };
}

function proposalRow(
  id: string,
  options: { decision: "accepted" | "rejected" | null },
) {
  return {
    id,
    origin: "ai_initial",
    source_proposal_id: null as string | null,
    planning_note: "Only 45 minutes on weekdays.",
    regeneration_feedback: null,
    content: { title: "Toward the hilly half", phases: [] },
    created_at: "2026-08-10T09:00:00.000Z",
    generation_request_id: "00000000-0000-4000-8000-000000000030",
    roadmap_proposal_decisions: options.decision
      ? [{ decision: options.decision }]
      : [],
    roadmap_generation_requests: [
      {
        requested_start_date: "2026-08-10",
        requested_end_date: "2026-11-02",
        regeneration_number: 1,
      },
    ],
  };
}

function client(overrides: Record<string, unknown>) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: USER_ID } },
        error: null,
      }),
    },
    ...overrides,
  } as never;
}
