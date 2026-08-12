import { describe, expect, it, vi } from "vitest";

import {
  PlanProposalAuthenticationError,
  PlanProposalConflictError,
  PlanProposalPersistenceError,
  PlanProposalRepository,
} from "@/server/repositories/plan-proposal-repository";

const USER_ID = "40000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "70000000-0000-4000-8000-000000000001";

describe("PlanProposalRepository", () => {
  it("claims without an owner argument and omits an absent planning note", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generation_id: "60000000-0000-4000-8000-000000000001",
        completion_token: "50000000-0000-4000-8000-000000000001",
        state: "claimed",
        proposal_id: null,
      },
      error: null,
    });
    const repository = new PlanProposalRepository(client({ rpc }));

    await repository.beginGeneration({
      idempotencyKey: "pk_1234567890abcdef",
      requestFingerprint: "plan.v2:2026-08-12:7:1:1:0",
      startDate: "2026-08-12",
      dayCount: 7,
      planningNote: null,
    });

    expect(rpc).toHaveBeenCalledWith("begin_plan_generation", {
      p_idempotency_key: "pk_1234567890abcdef",
      p_request_fingerprint: "plan.v2:2026-08-12:7:1:1:0",
      p_start_date: "2026-08-12",
      p_day_count: 7,
    });
  });

  it("rejects through the owner-derived RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { proposal_id: PROPOSAL_ID, result: "rejected" },
      error: null,
    });
    const repository = new PlanProposalRepository(client({ rpc }));

    await repository.rejectProposal(PROPOSAL_ID);

    expect(rpc).toHaveBeenCalledWith("reject_plan_proposal", {
      p_proposal_id: PROPOSAL_ID,
    });
  });

  it("maps only PT409 to a reviewable conflict", async () => {
    const repository = new PlanProposalRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PT409", message: "private database text" },
        }),
      }),
    );
    await expect(repository.rejectProposal(PROPOSAL_ID)).rejects.toThrow(
      PlanProposalConflictError,
    );
  });

  it("does not reveal other database failures", async () => {
    const repository = new PlanProposalRepository(
      client({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "23514", message: "private database text" },
        }),
      }),
    );
    const failure = await repository
      .rejectProposal(PROPOSAL_ID)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PlanProposalPersistenceError);
    expect((failure as Error).message).toBe(
      "The plan proposal could not be saved.",
    );
  });

  it("does not reach an RPC for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new PlanProposalRepository(
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
    await expect(repository.rejectProposal(PROPOSAL_ID)).rejects.toThrow(
      PlanProposalAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

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
