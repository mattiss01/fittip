import "server-only";

import type { CoachAIOperation } from "@/server/ai/contracts";

/**
 * The durable spend seam.
 *
 * M3-01's `CoachAIBudget` is in-memory, which is correct for a deterministic
 * local run and worthless in a hosted one: a Vercel instance change resets it,
 * and a reset spend counter is no counter at all. M3-01B decision 8 puts the
 * authoritative spend state in Postgres behind two `SECURITY DEFINER`
 * functions.
 *
 * This module declares the seam and nothing else. It imports no database
 * client, no repository, and no Supabase type, so the AI subtree keeps its
 * invariant that only `owner.ts` and `context-source.ts` reach the database.
 * The implementation lives in `src/server/repositories/ai-spend-repository.ts`,
 * outside this subtree.
 */

/**
 * What the caller holds between reserving and settling.
 *
 * `settlementToken` is a capability, not an identifier. The database withholds
 * it from the owner's own `SELECT` grant, so possessing it is what proves the
 * settlement came from the server that made the reservation rather than from
 * the owner the reservation constrains. Treat it like a credential: it belongs
 * in no log, error, telemetry record, or response.
 */
export type CoachAISpendHandle = {
  reservationId: string;
  settlementToken: string;
  /** The UTC day the database charged it to, echoed back for reconciliation. */
  spendDay: string;
  reservedMicroUsd: number;
  expiresAt: string;
};

export type CoachAISpendReservationInput = {
  operation: CoachAIOperation;
  /** Integer micro-USD (1e-6 USD), as everywhere else in the budget path. */
  reservedMicroUsd: number;
  rateCardVersion: string;
  currency: "USD";
};

export interface CoachAISpendLedger {
  /**
   * Charges the upper bound before the call. Throws `budget_exhausted` when a
   * ceiling refuses it; the ceilings are the database's, not the caller's.
   */
  reserve(input: CoachAISpendReservationInput): Promise<CoachAISpendHandle>;

  /**
   * Reconciles against provider-reported usage. Settling a reservation that is
   * already settled is not an error — the reservation is closed either way, and
   * a settlement racing an expiry must not turn a completed proposal into a
   * failed one.
   */
  settle(handle: CoachAISpendHandle, chargedMicroUsd: number): Promise<void>;
}
