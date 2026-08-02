import { describe, expect, it, vi } from "vitest";

import {
  OnboardingAuthenticationError,
  OnboardingConflictError,
  OnboardingDatabaseValidationError,
  OnboardingPersistenceError,
  OnboardingRepository,
} from "./onboarding-repository";

const USER_ID = "54000000-0000-4000-8000-000000000001";

describe("OnboardingRepository writes", () => {
  it("authenticates, supplies no owner or provenance, and disables retries", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: {
        draft_id: crypto.randomUUID(),
        draft_revision: 1,
        result: "saved",
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new OnboardingRepository(client({ rpc }));

    await repository.apply({
      operation: "save_preferences",
      expectedDraftRevision: 0,
      payload: {
        advance: true,
        preferences: ["Keep hard sessions concise."],
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      "apply_onboarding_change",
      expect.not.objectContaining({
        user_id: expect.anything(),
        provenance: expect.anything(),
        author_class: expect.anything(),
        confidence: expect.anything(),
      }),
    );
    expect(rpc).toHaveBeenCalledWith("apply_onboarding_change", {
      p_expected_draft_revision: 0,
      p_operation: "save_preferences",
      p_payload: {
        advance: true,
        preferences: ["Keep hard sessions concise."],
      },
    });
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("sends the exact revisions and idempotency key for publication", async () => {
    const rpc = vi.fn().mockReturnValue({
      retry: vi
        .fn()
        .mockResolvedValue({ data: { result: "published" }, error: null }),
    });
    const repository = new OnboardingRepository(client({ rpc }));
    const key = crypto.randomUUID();

    await repository.apply({
      operation: "publish",
      expectedDraftRevision: 6,
      expectedGoalRevision: 3,
      expectedMemoryRevision: 4,
      idempotencyKey: key,
    });

    expect(rpc).toHaveBeenCalledWith("apply_onboarding_change", {
      p_expected_draft_revision: 6,
      p_operation: "publish",
      p_payload: {},
      p_expected_goal_revision: 3,
      p_expected_memory_revision: 4,
      p_idempotency_key: key,
    });
  });

  it("maps stale/lock, validation and generic errors without forwarding content", async () => {
    await expect(
      repositoryWithError({
        code: "PT409",
        message: "Onboarding changed.",
      }).apply({
        operation: "start",
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow(OnboardingConflictError);

    await expect(
      repositoryWithError({
        code: "22023",
        message: "synthetic-private-error-marker",
      }).apply({
        operation: "start",
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow(OnboardingDatabaseValidationError);

    const generic = repositoryWithError({
      code: "XX000",
      message: "synthetic-private-error-marker",
    }).apply({
      operation: "start",
      expectedDraftRevision: 0,
    });
    await expect(generic).rejects.toThrow(OnboardingPersistenceError);
    await expect(generic).rejects.not.toThrow(/synthetic-private-error-marker/);
  });

  it("never calls the RPC for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new OnboardingRepository(
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

    await expect(
      repository.apply({
        operation: "start",
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow(OnboardingAuthenticationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

function repositoryWithError(error: { code: string; message: string }) {
  return new OnboardingRepository(
    client({
      rpc: vi.fn().mockReturnValue({
        retry: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    }),
  );
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
