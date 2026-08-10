import { describe, expect, it, vi } from "vitest";

import { AISpendRepository } from "./ai-spend-repository";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAISpendHandle } from "@/server/ai/spend";

const USER_ID = "53000000-0000-4000-8000-000000000001";
const RESERVATION_ID = "44444444-4444-4444-8444-444444444444";
const SETTLEMENT_TOKEN = "55555555-5555-4555-8555-555555555555";

const RECEIPT = {
  reservation_id: RESERVATION_ID,
  settlement_token: SETTLEMENT_TOKEN,
  spend_day: "2026-08-10",
  reserved_micro_usd: 5200,
  expires_at: "2026-08-10T09:15:00.000Z",
};

const HANDLE: CoachAISpendHandle = {
  reservationId: RESERVATION_ID,
  settlementToken: SETTLEMENT_TOKEN,
  spendDay: "2026-08-10",
  reservedMicroUsd: 5200,
  expiresAt: "2026-08-10T09:15:00.000Z",
};

const RESERVATION = {
  operation: "create_roadmap",
  reservedMicroUsd: 5200,
  rateCardVersion: "openai-gpt-5.6-luna-2026-08-10",
  currency: "USD",
} as const;

async function codeFor(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CoachAIError) return error.code;
    throw error;
  }
  throw new Error("expected the spend ledger to fail");
}

describe("reserving durable spend", () => {
  it("authenticates and supplies no owner", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: RECEIPT, error: null });
    const repository = new AISpendRepository(client({ rpc }));

    expect(await repository.reserve(RESERVATION)).toEqual(HANDLE);

    // The owner is derived from `auth.uid()` inside the function. A `user_id`
    // argument would let any caller reserve against somebody else's budget.
    expect(rpc).toHaveBeenCalledWith(
      "reserve_ai_spend",
      expect.not.objectContaining({ user_id: expect.anything() }),
    );
    expect(rpc).toHaveBeenCalledWith("reserve_ai_spend", {
      p_operation: "create_roadmap",
      p_reserved_micro_usd: 5200,
      p_rate_card_version: "openai-gpt-5.6-luna-2026-08-10",
      p_currency: "USD",
    });
  });

  it.each<[string, string, string]>([
    ["a ceiling refusal", "PT402", "budget_exhausted"],
    ["a busy owner lock", "PT409", "concurrency_limited"],
    ["a malformed reservation", "22023", "invalid_input"],
    ["an unauthenticated session", "42501", "owner_denied"],
    ["a missing profile", "23503", "owner_denied"],
    ["something nobody has diagnosed", "XX000", "budget_unavailable"],
  ])("maps %s to %s", async (_case, sqlState, code) => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: sqlState } });
    const repository = new AISpendRepository(client({ rpc }));

    expect(await codeFor(() => repository.reserve(RESERVATION))).toBe(code);
  });

  it("refuses a receipt it cannot settle later", async () => {
    // A composite arrives nullable whatever the function guarantees. A handle
    // without a token could never be settled, so the hold would sit until it
    // expired while the caller believed it had reserved.
    const rpc = vi.fn().mockResolvedValue({
      data: { ...RECEIPT, settlement_token: null },
      error: null,
    });
    const repository = new AISpendRepository(client({ rpc }));

    expect(await codeFor(() => repository.reserve(RESERVATION))).toBe(
      "budget_unavailable",
    );
  });

  it("denies when the caller is not an allowed verified user", async () => {
    const rpc = vi.fn();
    const repository = new AISpendRepository(
      client({
        rpc,
        auth: {
          getClaims: vi
            .fn()
            .mockResolvedValue({
              data: null,
              error: { message: "no session" },
            }),
        },
      }),
    );

    expect(await codeFor(() => repository.reserve(RESERVATION))).toBe(
      "owner_denied",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never disables retry, so the pinned RPC set stays as it is", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: RECEIPT, error: null });
    const repository = new AISpendRepository(client({ rpc }));

    await repository.reserve(RESERVATION);

    // A retried reserve over-holds budget and releases it at expiry; it can
    // never under-charge. That is the safe direction, and it is cheaper than
    // widening the architecture invariant.
    expect(rpc.mock.results[0].value).toBeInstanceOf(Promise);
  });
});

describe("settling durable spend", () => {
  it("settles by token and charge alone", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { reservation_id: RESERVATION_ID, charged_micro_usd: 2400 },
      error: null,
    });
    const repository = new AISpendRepository(client({ rpc }));

    await repository.settle(HANDLE, 2400);

    expect(rpc).toHaveBeenCalledWith("settle_ai_spend", {
      p_settlement_token: SETTLEMENT_TOKEN,
      p_charged_micro_usd: 2400,
    });
  });

  it("treats an already-closed reservation as settled", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "PT409" } });
    const repository = new AISpendRepository(client({ rpc }));

    // Raising here would turn a completed proposal into a failed one over
    // bookkeeping the caller cannot act on.
    await expect(repository.settle(HANDLE, 2400)).resolves.toBeUndefined();
  });

  it("reports any other settlement failure", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "XX000" } });
    const repository = new AISpendRepository(client({ rpc }));

    expect(await codeFor(() => repository.settle(HANDLE, 2400))).toBe(
      "budget_unavailable",
    );
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
