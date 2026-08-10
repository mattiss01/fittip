import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import { CoachAIError } from "@/server/ai/errors";
import type {
  CoachAISpendHandle,
  CoachAISpendLedger,
  CoachAISpendReservationInput,
} from "@/server/ai/spend";

/**
 * The durable spend ledger, over the two `SECURITY DEFINER` functions M3-01B
 * added.
 *
 * It lives here rather than under `src/server/ai` because that subtree may only
 * reach the database through its two named seams. `CoachAISpendLedger` is
 * declared there and implemented here, so the AI boundary keeps its invariant
 * and still gets durable state.
 *
 * Neither call passes an owner. `reserve_ai_spend` and `settle_ai_spend` read
 * `auth.uid()` themselves, so there is no `user_id` argument for a caller to
 * get wrong or to forge — which is the whole point of decision 8, since the
 * party this ledger constrains is the same party whose JWT carries the write.
 */

type AISpendClient = SupabaseClient<Database> | ServerUserClient;

type ReservationReceipt =
  Database["public"]["CompositeTypes"]["ai_spend_reservation_receipt"];

export class AISpendRepository implements CoachAISpendLedger {
  constructor(private readonly client: AISpendClient) {}

  async reserve(
    input: CoachAISpendReservationInput,
  ): Promise<CoachAISpendHandle> {
    // Verified here as well as by the caller, so the repository is safe to use
    // on its own. A component that is only correct when invoked in the right
    // order is a trap for the next caller.
    await this.requireOwner();

    // Retries are deliberately left at the client default here.
    // `src/architecture/server-boundary.test.ts` pins the exact set of five
    // atomic RPCs permitted to disable them, and widening that set is an
    // architectural change this ticket was not given. The failure it leaves
    // open is safe in the one direction that matters: a retried reservation
    // creates a second row, which over-holds budget and releases it at the
    // 15-minute expiry, and can never under-charge.
    const { data, error } = await this.client.rpc("reserve_ai_spend", {
      p_operation: input.operation,
      p_reserved_micro_usd: input.reservedMicroUsd,
      p_rate_card_version: input.rateCardVersion,
      p_currency: input.currency,
    });

    if (error) throw reserveError(error.code);
    return toHandle(data);
  }

  async settle(
    handle: CoachAISpendHandle,
    chargedMicroUsd: number,
  ): Promise<void> {
    // Deliberately not re-verifying the caller. The settlement token is itself
    // the capability, the function re-derives `auth.uid()`, and an unauthorized
    // session gets no row either way — while an extra round trip here would sit
    // between the provider's answer and the record of what it cost, which is
    // the worst place in the request to add one.
    const { error } = await this.client.rpc("settle_ai_spend", {
      p_settlement_token: handle.settlementToken,
      p_charged_micro_usd: chargedMicroUsd,
    });

    if (!error) return;
    // PT409 means the reservation is already closed — settled by a racing call,
    // or never open. Either way it is not an error the caller can act on, and
    // raising it would turn a completed proposal into a failed one.
    if (error.code === "PT409") return;
    throw new CoachAIError("budget_unavailable");
  }

  private async requireOwner(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new CoachAIError("owner_denied");
      }
      throw new CoachAIError("owner_denied");
    }
  }
}

export async function createAISpendRepository(): Promise<AISpendRepository> {
  return new AISpendRepository(await createServerUserClient());
}

/**
 * Postgres composite fields arrive nullable whatever the function guarantees,
 * so the receipt is checked rather than trusted. A reservation whose token or
 * amount did not come back cannot be settled later, and treating it as usable
 * would strand the hold until it expired.
 */
function toHandle(receipt: ReservationReceipt | null): CoachAISpendHandle {
  if (
    !receipt ||
    typeof receipt.reservation_id !== "string" ||
    typeof receipt.settlement_token !== "string" ||
    typeof receipt.spend_day !== "string" ||
    typeof receipt.expires_at !== "string" ||
    typeof receipt.reserved_micro_usd !== "number"
  ) {
    throw new CoachAIError("budget_unavailable");
  }

  return {
    reservationId: receipt.reservation_id,
    settlementToken: receipt.settlement_token,
    spendDay: receipt.spend_day,
    reservedMicroUsd: receipt.reserved_micro_usd,
    expiresAt: receipt.expires_at,
  };
}

/**
 * Database refusals become the boundary's own stable codes. A Postgres error
 * message can name a table, a constraint, or a figure, so none of it is
 * forwarded.
 */
function reserveError(code: string | undefined): CoachAIError {
  switch (code) {
    case "PT402":
      return new CoachAIError("budget_exhausted");
    case "PT409":
      // The per-owner advisory lock was already held: another reservation for
      // this owner is in flight.
      return new CoachAIError("concurrency_limited");
    case "22023":
      return new CoachAIError("invalid_input");
    case "42501":
    case "23503":
      return new CoachAIError("owner_denied");
    default:
      // Unknown is never treated as permission to spend.
      return new CoachAIError("budget_unavailable");
  }
}
