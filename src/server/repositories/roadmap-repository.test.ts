import { describe, expect, it, vi } from "vitest";

import {
  RoadmapAuthenticationError,
  RoadmapConflictError,
  RoadmapPersistenceError,
  RoadmapRepository,
} from "@/server/repositories/roadmap-repository";
import {
  isExampleAuthored,
  OWNER_PROVIDER_CODE,
  UNKNOWN_PROVIDER_CODE,
} from "@/server/roadmap/roadmap-records";

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
      history: [
        {
          ...proposalView(SECOND_PROPOSAL, "accepted"),
          origin: "owner_edit",
          sourceProposalId: FIRST_PROPOSAL,
        },
        proposalView(FIRST_PROPOSAL, null),
      ],
    });
  });

  it("offers no predecessor once a proposal has been accepted", async () => {
    const { repository } = readingProposals([
      proposalRow(SECOND_PROPOSAL, { decision: "accepted" }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toEqual({
      open: null,
      declinedPredecessor: null,
      history: [proposalView(SECOND_PROPOSAL, "accepted")],
    });
  });

  // M3-11 appended `expired` to proposals whose sources it deleted. Such a
  // proposal is neither open nor a predecessor, so `history` is the only field
  // a screen could read it from.
  it("returns a settled proposal as history with the state it carries", async () => {
    const { repository } = readingProposals([
      proposalRow(SECOND_PROPOSAL, { decision: "expired" }),
      proposalRow(FIRST_PROPOSAL, { decision: "accepted" }),
    ]);

    await expect(repository.getReviewProposals()).resolves.toMatchObject({
      open: null,
      declinedPredecessor: null,
      history: [
        { id: SECOND_PROPOSAL, decision: "expired" },
        { id: FIRST_PROPOSAL, decision: "accepted" },
      ],
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

  // ADR-026. The owner and the day are the database's; the call carries the
  // version, the place and which way.
  it("marks a milestone through its function, with no owner and no day", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = new RoadmapRepository(client({ rpc }));

    await repository.setMilestoneReached({
      versionId: FIRST_PROPOSAL,
      phaseIndex: 1,
      milestoneIndex: 2,
      reached: true,
    });

    expect(rpc).toHaveBeenCalledWith("set_roadmap_milestone_reached", {
      p_version_id: FIRST_PROPOSAL,
      p_phase_index: 1,
      p_milestone_index: 2,
      p_reached: true,
    });
  });

  it("reports a refused mark as a roadmap that is no longer available", async () => {
    const refused = new RoadmapRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "22023", message: "Invalid milestone mark." },
        }),
      }),
    );
    await expect(
      refused.setMilestoneReached({
        versionId: FIRST_PROPOSAL,
        phaseIndex: 0,
        milestoneIndex: 0,
        reached: false,
      }),
    ).rejects.toMatchObject({ reason: "not-available" });

    const failed = new RoadmapRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "XX000",
            message: "constraint roadmap_milestone_marks",
          },
        }),
      }),
    );
    await expect(
      failed.setMilestoneReached({
        versionId: FIRST_PROPOSAL,
        phaseIndex: 0,
        milestoneIndex: 0,
        reached: true,
      }),
    ).rejects.toBeInstanceOf(RoadmapPersistenceError);
  });

  it("reads the marks of one version, as the owner", async () => {
    const eq = vi.fn();
    const query = {
      select: vi.fn(() => query),
      eq: (column: string, value: string) => {
        eq(column, value);
        return query;
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: [
            { phase_index: 0, milestone_index: 1, reached_on: "2026-10-13" },
          ],
          error: null,
        }),
    };
    const repository = new RoadmapRepository(
      client({ from: vi.fn(() => query) }),
    );

    await expect(
      repository.listMilestoneMarks(FIRST_PROPOSAL),
    ).resolves.toEqual([
      { phaseIndex: 0, milestoneIndex: 1, reachedOn: "2026-10-13" },
    ]);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(eq).toHaveBeenCalledWith("version_id", FIRST_PROPOSAL);
  });

  // ADR-027. The owner, the day and whether the phase has ended are the
  // database's; the call carries the version and the phase.
  it("marks a roadmap reviewed through its function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = new RoadmapRepository(client({ rpc }));

    await repository.setReviewed({ versionId: FIRST_PROPOSAL, phaseIndex: 1 });

    expect(rpc).toHaveBeenCalledWith("set_roadmap_reviewed", {
      p_version_id: FIRST_PROPOSAL,
      p_phase_index: 1,
    });

    const refused = new RoadmapRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "22023", message: "Invalid roadmap review." },
        }),
      }),
    );
    await expect(
      refused.setReviewed({ versionId: FIRST_PROPOSAL, phaseIndex: 4 }),
    ).rejects.toMatchObject({ reason: "not-available" });
  });

  it("reads how far a version is marked reviewed, as the owner", async () => {
    const eq = vi.fn();
    const reading = (row: { phase_index: number } | null) => {
      const query = {
        select: vi.fn(() => query),
        eq: (column: string, value: string) => {
          eq(column, value);
          return query;
        },
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      };
      return new RoadmapRepository(client({ from: vi.fn(() => query) }));
    };

    await expect(
      reading({ phase_index: 2 }).getReviewedThrough(FIRST_PROPOSAL),
    ).resolves.toBe(2);
    await expect(
      reading(null).getReviewedThrough(FIRST_PROPOSAL),
    ).resolves.toBeNull();
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(eq).toHaveBeenCalledWith("version_id", FIRST_PROPOSAL);
  });

  // ADR-028. Whether a proposal answered a change request is the request's
  // to say, and asking again reads it from there.
  it("reads whether a proposal answered a request to change the roadmap", async () => {
    const row = proposalRow(SECOND_PROPOSAL, { decision: "rejected" });
    row.roadmap_generation_requests[0].changes_roadmap = true;
    const { repository } = readingProposals([row]);

    await expect(repository.getReviewProposals()).resolves.toMatchObject({
      declinedPredecessor: { id: SECOND_PROPOSAL, changesRoadmap: true },
    });
  });

  it("says a first request is a change, and leaves a regeneration to the database", async () => {
    const receipt = {
      data: {
        generation_id: "00000000-0000-4000-8000-000000000020",
        completion_token: "00000000-0000-4000-8000-000000000021",
        state: "claimed",
        regeneration_number: 0,
        proposal_id: null,
      },
      error: null,
    };
    const request = {
      idempotencyKey: "rk_0123456789abcdef",
      requestFingerprint:
        "roadmap.v4:2026-08-10:2026-11-02:1:initial:5:0:change",
      startDate: "2026-08-10",
      endDate: "2026-11-02",
      expectedHeadRevision: 1,
      planningNote: "Easier.",
      regenerationFeedback: null,
      changeRoadmap: true,
    };

    const first = vi.fn().mockResolvedValue(receipt);
    await new RoadmapRepository(client({ rpc: first })).beginGeneration({
      ...request,
      previousProposalId: null,
    });
    expect(first.mock.calls[0][1]).toMatchObject({ p_change_roadmap: true });

    const again = vi.fn().mockResolvedValue(receipt);
    await new RoadmapRepository(client({ rpc: again })).beginGeneration({
      ...request,
      previousProposalId: FIRST_PROPOSAL,
      regenerationFeedback: "Start easier.",
    });
    expect(Object.keys(again.mock.calls[0][1])).not.toContain(
      "p_change_roadmap",
    );
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
      requestFingerprint: "roadmap.v4:2026-08-10:2026-11-02:0:initial:0:0",
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
    ["PT409", "Your roadmap changed. Reload and try again.", "stale"],
    // Another roadmap was accepted since the proposal was made: its own
    // reason, since reloading cannot help.
    [
      "PT409",
      "Your roadmap changed since this was proposed. Decline it and ask again.",
      "roadmap-moved",
    ],
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

  // The example label rests on this field and on nothing else, so the read has
  // to carry what the row says rather than what the origin implies.
  it("reads a proposal's provenance from the row", async () => {
    const { repository } = readingProposals([
      {
        ...proposalRow(SECOND_PROPOSAL, { decision: null }),
        provider_code: "openai",
      },
    ]);

    await expect(repository.getReviewProposals()).resolves.toMatchObject({
      open: { id: SECOND_PROPOSAL, providerCode: "openai" },
    });
  });

  // `roadmap_versions` carries no provider column, so a version's provenance
  // comes from the proposal it was accepted from. PostgREST returns a to-one
  // embed as an object or as a one-element array depending on how it resolves
  // the relationship, and both have to map to the same view.
  it("reads a version's provenance through the proposal it came from", async () => {
    const rows = [
      versionRow(2, { roadmap_proposals: { provider_code: "fixture" } }),
      versionRow(1, { roadmap_proposals: [{ provider_code: "openai" }] }),
    ];

    await expect(readingVersions(rows).listVersions()).resolves.toEqual([
      {
        id: "version-2",
        versionNumber: 2,
        content: { title: "Toward the hilly half", phases: [] },
        acceptedAt: "2026-08-10T09:00:00.000Z",
        providerCode: "fixture",
      },
      {
        id: "version-1",
        versionNumber: 1,
        content: { title: "Toward the hilly half", phases: [] },
        acceptedAt: "2026-08-10T09:00:00.000Z",
        providerCode: "openai",
      },
    ]);
  });

  // An unreadable embed is never passed off as a real provider code. It reports
  // the sentinel, which `isExampleAuthored` treats as an example: the unsafe
  // direction is a fixture-authored roadmap rendering as a real one with
  // nothing anywhere to say otherwise.
  it("fails closed when the provenance cannot be read", async () => {
    const versions = await readingVersions([
      versionRow(1, { roadmap_proposals: null }),
    ]).listVersions();

    expect(versions[0].providerCode).toBe(UNKNOWN_PROVIDER_CODE);
    expect(isExampleAuthored(versions[0].providerCode)).toBe(true);
  });

  // ADR-029. A roadmap written by hand stores no provider code, and that is
  // not an unreadable one: it is the owner's, and no example.
  it("reads a hand-written roadmap as the owner's, not an example", async () => {
    const versions = await readingVersions([
      versionRow(1, {
        roadmap_proposals: { provider_code: null, origin: "owner_written" },
      }),
    ]).listVersions();

    expect(versions[0].providerCode).toBe(OWNER_PROVIDER_CODE);
    expect(isExampleAuthored(versions[0].providerCode)).toBe(false);
  });

  it("still fails closed on a missing code from any other origin", async () => {
    const versions = await readingVersions([
      versionRow(1, {
        roadmap_proposals: { provider_code: null, origin: "ai_initial" },
      }),
    ]).listVersions();

    expect(versions[0].providerCode).toBe(UNKNOWN_PROVIDER_CODE);
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

function readingVersions(rows: ReturnType<typeof versionRow>[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (table !== "roadmap_versions") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { select };
  });

  return new RoadmapRepository(client({ from }));
}

function versionRow(
  versionNumber: number,
  overrides: { roadmap_proposals: unknown },
) {
  return {
    id: `version-${versionNumber}`,
    version_number: versionNumber,
    content: { title: "Toward the hilly half", phases: [] },
    accepted_at: "2026-08-10T09:00:00.000Z",
    ...overrides,
  };
}

function proposalRow(
  id: string,
  options: { decision: "accepted" | "rejected" | "expired" | null },
) {
  return {
    id,
    origin: "ai_initial",
    source_proposal_id: null as string | null,
    planning_note: "Only 45 minutes on weekdays.",
    regeneration_feedback: null,
    provider_code: "fixture",
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
        changes_roadmap: false,
      },
    ],
  };
}

/** The view `proposalRow` maps to, written out rather than derived from it. */
function proposalView(
  id: string,
  decision: "accepted" | "rejected" | "expired" | null,
) {
  return {
    id,
    origin: "ai_initial",
    sourceProposalId: null as string | null,
    providerCode: "fixture",
    content: { title: "Toward the hilly half", phases: [] },
    planningNote: "Only 45 minutes on weekdays.",
    regenerationFeedback: null,
    regenerationNumber: 1,
    changesRoadmap: false,
    startDate: "2026-08-10",
    endDate: "2026-11-02",
    decision,
    createdAt: "2026-08-10T09:00:00.000Z",
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
