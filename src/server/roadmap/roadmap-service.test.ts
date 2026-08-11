import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRoadmapCoachAIServiceMock, contextSourceMock } = vi.hoisted(
  () => ({
    createRoadmapCoachAIServiceMock: vi.fn(),
    contextSourceMock: vi.fn(),
  }),
);

vi.mock("@/server/ai/composition", () => ({
  createRoadmapCoachAIService: createRoadmapCoachAIServiceMock,
}));
vi.mock("@/server/ai/context-source", () => ({
  RepositoryCoachAIContextSource: contextSourceMock,
}));

import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import { RoadmapConflictError } from "@/server/repositories/roadmap-repository";
import {
  generateRoadmapProposal,
  reducePreviousProposal,
} from "@/server/roadmap/roadmap-service";

const OWNER = {
  id: "00000000-0000-4000-8000-000000000001",
} as unknown as CoachAIOwner;
const PREVIOUS_ID = "00000000-0000-4000-8000-000000000011";
const NEW_PROPOSAL_ID = "00000000-0000-4000-8000-000000000012";
const TOKEN = "00000000-0000-4000-8000-000000000021";

let propose: ReturnType<typeof vi.fn>;

describe("generateRoadmapProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propose = vi.fn().mockResolvedValue({
      proposal: proposalContent(),
      memoryCandidates: [],
      sources: [{ kind: "goal", recordId: "goal-1" }],
      spendReservationId: null,
    });
    createRoadmapCoachAIServiceMock.mockReturnValue({
      service: { propose },
      binding: {
        providerCode: "fixture",
        modelCode: "fixture-corpus-v1",
        rateCard: { version: "fixture-no-spend" },
      },
    });
  });

  it("sends only the immediately previous proposal, reduced to its shape", async () => {
    const roadmaps = repository();

    await generateRoadmapProposal(regeneration(), dependencies(roadmaps));

    expect(roadmaps.getProposal).toHaveBeenCalledWith(PREVIOUS_ID);
    const [request] = propose.mock.calls[0] as [
      { compose: { previousProposal: unknown } },
    ];
    expect(request.compose.previousProposal).toEqual({
      title: "Toward the hilly half",
      summary: "Twelve weeks of building, then sharpening.",
      phases: [
        {
          title: "Base",
          focus: "Aerobic volume at conversational effort.",
          startDate: "2026-08-10",
          endDate: "2026-09-20",
        },
      ],
    });
  });

  it("records the predecessor on the claim it opens", async () => {
    const roadmaps = repository();

    await generateRoadmapProposal(regeneration(), dependencies(roadmaps));

    expect(roadmaps.beginGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        previousProposalId: PREVIOUS_ID,
        regenerationFeedback: "The first phase is too long.",
        expectedHeadRevision: 1,
      }),
    );
  });

  it("fails a regeneration whose predecessor is gone without consuming a key", async () => {
    const roadmaps = repository();
    roadmaps.getProposal.mockResolvedValue(null);

    await expect(
      generateRoadmapProposal(regeneration(), dependencies(roadmaps)),
    ).rejects.toBeInstanceOf(RoadmapConflictError);
    expect(roadmaps.beginGeneration).not.toHaveBeenCalled();
    expect(propose).not.toHaveBeenCalled();
  });

  // The fingerprint travels to the database. Owner text must not.
  it("fingerprints the owner's text by length, never by content", async () => {
    const roadmaps = repository();

    await generateRoadmapProposal(regeneration(), dependencies(roadmaps));

    const [claim] = roadmaps.beginGeneration.mock.calls[0] as [
      { requestFingerprint: string },
    ];
    expect(claim.requestFingerprint).toBe(
      `roadmap.v2:2026-08-10:2026-11-02:1:${PREVIOUS_ID}:28:28`,
    );
    expect(claim.requestFingerprint).not.toContain("45 minutes");
    expect(claim.requestFingerprint).not.toContain("first phase");
  });

  it("calls no provider for a key whose attempt already completed", async () => {
    const roadmaps = repository();
    roadmaps.beginGeneration.mockResolvedValue({
      generationId: "00000000-0000-4000-8000-000000000020",
      completionToken: TOKEN,
      state: "completed",
      regenerationNumber: 0,
      proposalId: NEW_PROPOSAL_ID,
    });

    await expect(
      generateRoadmapProposal(initialRequest(), dependencies(roadmaps)),
    ).resolves.toEqual({
      status: "proposal",
      proposalId: NEW_PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
    expect(propose).not.toHaveBeenCalled();
  });

  it("closes a failed attempt with a bounded code and no provider text", async () => {
    const roadmaps = repository();
    propose.mockRejectedValue(new CoachAIError("provider_unavailable"));

    await expect(
      generateRoadmapProposal(initialRequest(), dependencies(roadmaps)),
    ).rejects.toBeInstanceOf(CoachAIError);
    expect(roadmaps.finishGenerationAsFailed).toHaveBeenCalledWith(
      TOKEN,
      "provider_unavailable",
    );
    expect(roadmaps.finishGenerationWithProposal).not.toHaveBeenCalled();
  });

  it("persists the proposal with its own provenance, not the caller's", async () => {
    const roadmaps = repository();

    await expect(
      generateRoadmapProposal(initialRequest(), dependencies(roadmaps)),
    ).resolves.toMatchObject({
      status: "proposal",
      proposalId: NEW_PROPOSAL_ID,
    });
    expect(roadmaps.finishGenerationWithProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        completionToken: TOKEN,
        providerCode: "fixture",
        modelCode: "fixture-corpus-v1",
        rateCardVersion: "fixture-no-spend",
      }),
    );
  });

  // Decision 4b: the memory candidates are a separate transaction, and one
  // memory conflict must not cost the owner a valid roadmap.
  it("keeps a valid roadmap when the memory candidates conflict", async () => {
    const roadmaps = repository();
    propose.mockResolvedValue({
      proposal: proposalContent(),
      memoryCandidates: [
        { memoryType: "constraint", sourceExcerpt: "Only 45 minutes." },
      ],
      sources: [],
      spendReservationId: null,
    });
    roadmaps.recordMemoryCandidates.mockRejectedValue(
      new RoadmapConflictError("stale"),
    );

    await expect(
      generateRoadmapProposal(initialRequest(), dependencies(roadmaps)),
    ).resolves.toEqual({
      status: "proposal",
      proposalId: NEW_PROPOSAL_ID,
      memoryCandidateCount: 0,
    });
  });
});

describe("reducePreviousProposal", () => {
  it("carries the shape the coach must critique and nothing else", () => {
    const reduced = reducePreviousProposal(proposalContent());

    expect(Object.keys(reduced).sort()).toEqual(["phases", "summary", "title"]);
    expect(Object.keys(reduced.phases[0]).sort()).toEqual([
      "endDate",
      "focus",
      "startDate",
      "title",
    ]);
  });
});

function repository() {
  return {
    getProposal: vi.fn().mockResolvedValue({
      id: PREVIOUS_ID,
      content: proposalContent(),
    }),
    beginGeneration: vi.fn().mockResolvedValue({
      generationId: "00000000-0000-4000-8000-000000000020",
      completionToken: TOKEN,
      state: "pending",
      regenerationNumber: 1,
      proposalId: null,
    }),
    finishGenerationWithProposal: vi.fn().mockResolvedValue(NEW_PROPOSAL_ID),
    finishGenerationAsFailed: vi.fn().mockResolvedValue(undefined),
    recordMemoryCandidates: vi
      .fn()
      .mockResolvedValue({ collectionRevision: 1, itemIds: ["memory-1"] }),
  };
}

function dependencies(roadmaps: ReturnType<typeof repository>) {
  return {
    roadmaps,
    goals: {},
    memory: { list: vi.fn().mockResolvedValue({ items: [], revision: 3 }) },
    completions: {},
    plans: {},
    environment: {},
  } as unknown as Parameters<typeof generateRoadmapProposal>[1];
}

function initialRequest() {
  return {
    owner: OWNER,
    startDate: "2026-08-10",
    endDate: "2026-11-02",
    expectedHeadRevision: 1,
    planningNote: "Only 45 minutes on weekdays.",
    previousProposalId: null,
    regenerationFeedback: null,
    idempotencyKey: "rk_0123456789abcdef0123456789abcdef",
  };
}

function regeneration() {
  return {
    ...initialRequest(),
    previousProposalId: PREVIOUS_ID,
    regenerationFeedback: "The first phase is too long.",
  };
}

function proposalContent() {
  return {
    schemaVersion: "fittip.roadmap.v2",
    title: "Toward the hilly half",
    summary: "Twelve weeks of building, then sharpening.",
    phases: [
      {
        title: "Base",
        focus: "Aerobic volume at conversational effort.",
        startDate: "2026-08-10",
        endDate: "2026-09-20",
        goalAttention: [],
        milestones: [],
      },
    ],
    reviewPoints: [],
    assumptions: [],
    uncertainties: [],
    safetyConsiderations: [],
  } as never;
}
