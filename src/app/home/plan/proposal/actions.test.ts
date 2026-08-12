import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  revalidate: vi.fn(),
  owner: vi.fn(),
  userClient: vi.fn(),
  proposals: vi.fn(),
  goals: vi.fn(),
  memory: vi.fn(),
  completions: vi.fn(),
  plans: vi.fn(),
  spend: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/plan-proposal/plan-proposal-service", () => ({
  generatePlanProposal: mocks.generate,
}));
vi.mock("@/server/ai/owner", () => ({ verifyCoachAIOwner: mocks.owner }));
vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: mocks.userClient,
}));
vi.mock("@/server/repositories/plan-proposal-repository", async (original) => ({
  ...(await original<
    typeof import("@/server/repositories/plan-proposal-repository")
  >()),
  createPlanProposalRepository: mocks.proposals,
}));
vi.mock("@/server/repositories/goal-repository", () => ({
  createGoalRepository: mocks.goals,
}));
vi.mock("@/server/repositories/memory-repository", () => ({
  createMemoryRepository: mocks.memory,
}));
vi.mock("@/server/repositories/completion-repository", () => ({
  createCompletionRepository: mocks.completions,
}));
vi.mock("@/server/repositories/training-record-repository", () => ({
  createTrainingRecordRepository: mocks.plans,
}));
vi.mock("@/server/repositories/ai-spend-repository", () => ({
  createAISpendRepository: mocks.spend,
}));

import { INITIAL_PLAN_PROPOSAL_ACTION_STATE } from "./action-state";
import { generatePlanProposalAction } from "./actions";

describe("plan proposal action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue({ id: "owner" });
    mocks.userClient.mockResolvedValue({});
    for (const factory of [
      mocks.proposals,
      mocks.goals,
      mocks.memory,
      mocks.completions,
      mocks.plans,
      mocks.spend,
    ]) {
      factory.mockResolvedValue({});
    }
  });

  it("shows sanitized partial success when proposal saved but memory candidates did not", async () => {
    mocks.generate.mockResolvedValue({
      status: "proposal-partial",
      proposalId: "70000000-0000-4000-8000-000000000001",
      code: "memory_candidates_not_saved",
    });

    const result = await generatePlanProposalAction(
      INITIAL_PLAN_PROPOSAL_ACTION_STATE,
      form(),
    );

    expect(result).toMatchObject({
      status: "partial",
      proposalId: "70000000-0000-4000-8000-000000000001",
      message:
        "The proposal was saved, but its possible memory updates could not be saved. Review the proposal normally; nothing was accepted.",
    });
    expect(result.message).not.toMatch(/database|constraint|revision/i);
    expect(mocks.revalidate).toHaveBeenCalledWith("/home/plan/proposal");
  });
});

function form(): FormData {
  const formData = new FormData();
  formData.set("dayCount", "3");
  formData.set("startDate", "2026-08-12");
  formData.set("timezoneName", "Europe/Berlin");
  formData.set("planningNote", "Only weekdays before work.");
  formData.set("idempotencyKey", "pk_1234567890abcdef");
  return formData;
}
