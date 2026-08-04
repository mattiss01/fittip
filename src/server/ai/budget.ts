import "server-only";

import type { CoachAIOperation } from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";

/**
 * Rate, concurrency, and spend control as injected in-memory policy.
 *
 * In-memory state is correct only for local deterministic runs. It does not
 * survive a Vercel instance change, so it is not a hosted control: durable
 * shared fail-closed state is M3-01B's problem, together with the product
 * owner's approval of the real numbers. Nothing here is a module singleton —
 * a `CoachAIBudget` is constructed and injected, so no request shares mutable
 * module state with another.
 *
 * Money is integer micro-USD (1e-6 USD) throughout. Floating point currency
 * arithmetic near a hard ceiling is how a ceiling stops being hard.
 */

export type CoachAILimits = {
  windowMs: number;
  maxRequestsPerOwnerWindow: number;
  maxRequestsPerOperationWindow: number;
  maxConcurrentRequests: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  deadlineMs: number;
  /** 1 means no automatic retry. A retry needs approved billing behavior. */
  maxAttempts: number;
  perRequestCostCeilingMicroUsd: number;
  dailyCostCeilingMicroUsd: number;
  totalCostCeilingMicroUsd: number;
};

/**
 * Deterministic defaults for fixture runs. These are **not** approved live
 * caps: M3-01B carries the product owner's decision on request, token,
 * deadline, and spend ceilings, and a live adapter must be given those instead.
 */
export const COACH_AI_FIXTURE_LIMITS: CoachAILimits = {
  windowMs: 60_000,
  maxRequestsPerOwnerWindow: 6,
  maxRequestsPerOperationWindow: 3,
  maxConcurrentRequests: 1,
  maxInputTokens: 8_000,
  maxOutputTokens: 2_000,
  deadlineMs: 30_000,
  maxAttempts: 1,
  perRequestCostCeilingMicroUsd: 250_000,
  dailyCostCeilingMicroUsd: 2_000_000,
  totalCostCeilingMicroUsd: 20_000_000,
};

export type CoachAIRateCard = {
  version: string;
  currency: "USD";
  inputMicroUsdPerMillionTokens: number;
  outputMicroUsdPerMillionTokens: number;
  /** An instant. Past it the price is stale, which is unknown, which denies. */
  validUntil: string;
};

/** Returns `null` when no price is known. Unknown is never treated as zero. */
export type CoachAIRateCardSource = () => CoachAIRateCard | null;

export type CoachAIReservation = {
  ownerId: string;
  operation: CoachAIOperation;
  day: string;
  reservedMicroUsd: number;
  rateCardVersion: string;
  currency: "USD";
};

export type CoachAISettlement = {
  chargedMicroUsd: number;
  reconciled: boolean;
};

type ReserveInput = {
  ownerId: string;
  operation: CoachAIOperation;
  now: Date;
  limits: CoachAILimits;
  rateCard: CoachAIRateCard | null;
};

export class CoachAIBudget {
  #requests: { ownerId: string; operation: CoachAIOperation; atMs: number }[] =
    [];
  #activeByOwner = new Map<string, number>();
  #spentByDay = new Map<string, number>();
  #spentTotalMicroUsd = 0;

  /**
   * Charges the upper bound before the call, not after. A request that is never
   * settled therefore still counts against the ceilings.
   */
  reserve(input: ReserveInput): CoachAIReservation {
    const { ownerId, operation, now, limits, rateCard } = input;
    const nowMs = now.getTime();

    if (!isUsableRateCard(rateCard, nowMs)) {
      throw new CoachAIError("budget_unavailable");
    }

    this.#prune(nowMs - limits.windowMs);

    const ownerRequests = this.#requests.filter(
      (entry) => entry.ownerId === ownerId,
    );
    if (
      ownerRequests.length >= limits.maxRequestsPerOwnerWindow ||
      ownerRequests.filter((entry) => entry.operation === operation).length >=
        limits.maxRequestsPerOperationWindow
    ) {
      throw new CoachAIError("rate_limited");
    }

    if (
      (this.#activeByOwner.get(ownerId) ?? 0) >= limits.maxConcurrentRequests
    ) {
      throw new CoachAIError("concurrency_limited");
    }

    const reservedMicroUsd =
      costMicroUsd(
        limits.maxInputTokens,
        rateCard.inputMicroUsdPerMillionTokens,
      ) +
      costMicroUsd(
        limits.maxOutputTokens,
        rateCard.outputMicroUsdPerMillionTokens,
      );

    if (reservedMicroUsd > limits.perRequestCostCeilingMicroUsd) {
      throw new CoachAIError("budget_exhausted");
    }

    const day = utcDay(now);
    const spentToday = this.#spentByDay.get(day) ?? 0;
    if (
      spentToday + reservedMicroUsd > limits.dailyCostCeilingMicroUsd ||
      this.#spentTotalMicroUsd + reservedMicroUsd >
        limits.totalCostCeilingMicroUsd
    ) {
      throw new CoachAIError("budget_exhausted");
    }

    this.#requests.push({ ownerId, operation, atMs: nowMs });
    this.#activeByOwner.set(
      ownerId,
      (this.#activeByOwner.get(ownerId) ?? 0) + 1,
    );
    this.#spentByDay.set(day, spentToday + reservedMicroUsd);
    this.#spentTotalMicroUsd += reservedMicroUsd;

    return {
      ownerId,
      operation,
      day,
      reservedMicroUsd,
      rateCardVersion: rateCard.version,
      currency: rateCard.currency,
    };
  }

  /**
   * Reconciles the reservation against provider-reported usage and always frees
   * the concurrency slot. Missing, partial, or unusable usage keeps the full
   * reservation charged: a failed or silent call is not a free call.
   */
  settle(
    reservation: CoachAIReservation,
    reported: {
      inputTokens: number | null;
      outputTokens: number | null;
    } | null,
    rateCard: CoachAIRateCard | null,
  ): CoachAISettlement {
    const active = this.#activeByOwner.get(reservation.ownerId) ?? 0;
    if (active <= 1) this.#activeByOwner.delete(reservation.ownerId);
    else this.#activeByOwner.set(reservation.ownerId, active - 1);

    const reconcilable =
      reported !== null &&
      isTokenCount(reported.inputTokens) &&
      isTokenCount(reported.outputTokens) &&
      rateCard !== null &&
      rateCard.version === reservation.rateCardVersion;

    const chargedMicroUsd = reconcilable
      ? costMicroUsd(
          reported.inputTokens as number,
          rateCard.inputMicroUsdPerMillionTokens,
        ) +
        costMicroUsd(
          reported.outputTokens as number,
          rateCard.outputMicroUsdPerMillionTokens,
        )
      : reservation.reservedMicroUsd;

    const delta = chargedMicroUsd - reservation.reservedMicroUsd;
    if (delta !== 0) {
      this.#spentByDay.set(
        reservation.day,
        (this.#spentByDay.get(reservation.day) ?? 0) + delta,
      );
      this.#spentTotalMicroUsd += delta;
    }

    return { chargedMicroUsd, reconciled: reconcilable };
  }

  snapshot(): {
    spentTotalMicroUsd: number;
    activeRequests: number;
    windowRequests: number;
  } {
    let activeRequests = 0;
    for (const count of this.#activeByOwner.values()) activeRequests += count;
    return {
      spentTotalMicroUsd: this.#spentTotalMicroUsd,
      activeRequests,
      windowRequests: this.#requests.length,
    };
  }

  #prune(fromMs: number): void {
    this.#requests = this.#requests.filter((entry) => entry.atMs > fromMs);
  }
}

function isUsableRateCard(
  rateCard: CoachAIRateCard | null,
  nowMs: number,
): rateCard is CoachAIRateCard {
  if (rateCard === null) return false;

  const validUntilMs = Date.parse(rateCard.validUntil);
  return (
    typeof rateCard.version === "string" &&
    rateCard.version.length > 0 &&
    rateCard.currency === "USD" &&
    isNonNegativeInteger(rateCard.inputMicroUsdPerMillionTokens) &&
    isNonNegativeInteger(rateCard.outputMicroUsdPerMillionTokens) &&
    !Number.isNaN(validUntilMs) &&
    validUntilMs >= nowMs
  );
}

/** Rounds up: an estimate that rounds down is an estimate that under-charges. */
function costMicroUsd(tokens: number, microUsdPerMillion: number): number {
  return Math.ceil((tokens * microUsdPerMillion) / 1_000_000);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTokenCount(value: unknown): value is number {
  return isNonNegativeInteger(value);
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
