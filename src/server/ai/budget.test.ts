import { describe, expect, it } from "vitest";

import {
  CoachAIBudget,
  COACH_AI_FIXTURE_LIMITS,
  type CoachAILimits,
  type CoachAIRateCard,
} from "@/server/ai/budget";
import { CoachAIError } from "@/server/ai/errors";

const OWNER = "53000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "53000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-04T09:00:00.000Z");

const RATE_CARD: CoachAIRateCard = {
  version: "fixture-2026-08",
  currency: "USD",
  inputMicroUsdPerMillionTokens: 3_000_000,
  outputMicroUsdPerMillionTokens: 15_000_000,
  validUntil: "2026-09-01T00:00:00.000Z",
};

/** 8,000 input tokens at $3/M plus 2,000 output tokens at $15/M. */
const UPPER_BOUND_MICRO_USD = 24_000 + 30_000;

function reserve(
  budget: CoachAIBudget,
  overrides: {
    ownerId?: string;
    operation?: "create_roadmap" | "create_seven_day_plan";
    now?: Date;
    limits?: Partial<CoachAILimits>;
    rateCard?: CoachAIRateCard | null;
  } = {},
) {
  return budget.reserve({
    ownerId: overrides.ownerId ?? OWNER,
    operation: overrides.operation ?? "create_roadmap",
    now: overrides.now ?? NOW,
    limits: { ...COACH_AI_FIXTURE_LIMITS, ...overrides.limits },
    rateCard: overrides.rateCard === undefined ? RATE_CARD : overrides.rateCard,
  });
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CoachAIError) return error.code;
    throw error;
  }
  throw new Error("expected the budget to deny");
}

describe("cost reservation", () => {
  it("reserves the upper bound before the call, not after", () => {
    const budget = new CoachAIBudget();
    const reservation = reserve(budget);

    expect(reservation.reservedMicroUsd).toBe(UPPER_BOUND_MICRO_USD);
    expect(reservation.rateCardVersion).toBe(RATE_CARD.version);
    expect(budget.snapshot().spentTotalMicroUsd).toBe(UPPER_BOUND_MICRO_USD);
  });

  it.each<[string, CoachAIRateCard | null]>([
    ["no rate card at all", null],
    [
      "a rate card that expired",
      { ...RATE_CARD, validUntil: "2026-08-03T23:59:59.000Z" },
    ],
    [
      "a rate card with an unreadable validity",
      { ...RATE_CARD, validUntil: "soon" },
    ],
    [
      "a fractional price",
      { ...RATE_CARD, inputMicroUsdPerMillionTokens: 3.5 },
    ],
    ["a negative price", { ...RATE_CARD, outputMicroUsdPerMillionTokens: -1 }],
    ["an unhandled currency", { ...RATE_CARD, currency: "EUR" as "USD" }],
  ])("denies on %s rather than assuming zero", (_case, rateCard) => {
    const budget = new CoachAIBudget();
    expect(code(() => reserve(budget, { rateCard }))).toBe(
      "budget_unavailable",
    );
    expect(budget.snapshot()).toMatchObject({
      spentTotalMicroUsd: 0,
      activeRequests: 0,
    });
  });

  it("denies a single request that would exceed the per-request ceiling", () => {
    const budget = new CoachAIBudget();
    expect(
      code(() =>
        reserve(budget, {
          limits: { perRequestCostCeilingMicroUsd: UPPER_BOUND_MICRO_USD - 1 },
        }),
      ),
    ).toBe("budget_exhausted");
  });

  it("denies once the day's ceiling would be crossed", () => {
    const budget = new CoachAIBudget();
    const limits = {
      dailyCostCeilingMicroUsd: UPPER_BOUND_MICRO_USD + 1,
      maxRequestsPerOwnerWindow: 10,
      maxRequestsPerOperationWindow: 10,
    };

    const first = reserve(budget, { limits });
    budget.settle(first, null, RATE_CARD);

    expect(code(() => reserve(budget, { limits }))).toBe("budget_exhausted");
  });

  it("denies once the total ceiling would be crossed", () => {
    const budget = new CoachAIBudget();
    const limits = {
      totalCostCeilingMicroUsd: UPPER_BOUND_MICRO_USD + 1,
      maxRequestsPerOwnerWindow: 10,
      maxRequestsPerOperationWindow: 10,
    };

    budget.settle(reserve(budget, { limits }), null, RATE_CARD);
    expect(code(() => reserve(budget, { limits }))).toBe("budget_exhausted");
  });
});

describe("rate and concurrency", () => {
  it("stops an owner past the per-operation ceiling in the window", () => {
    const budget = new CoachAIBudget();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      budget.settle(reserve(budget), null, RATE_CARD);
    }

    expect(code(() => reserve(budget))).toBe("rate_limited");
  });

  it("stops an owner past the per-owner ceiling across operations", () => {
    const budget = new CoachAIBudget();
    const limits = { maxRequestsPerOperationWindow: 3 };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      budget.settle(reserve(budget, { limits }), null, RATE_CARD);
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      budget.settle(
        reserve(budget, { operation: "create_seven_day_plan", limits }),
        null,
        RATE_CARD,
      );
    }

    expect(
      code(() =>
        reserve(budget, { operation: "create_seven_day_plan", limits }),
      ),
    ).toBe("rate_limited");
  });

  it("counts one owner's requests against that owner only", () => {
    const budget = new CoachAIBudget();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      budget.settle(reserve(budget), null, RATE_CARD);
    }

    expect(() => reserve(budget, { ownerId: OTHER_OWNER })).not.toThrow();
  });

  it("releases the window once it has passed", () => {
    const budget = new CoachAIBudget();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      budget.settle(reserve(budget), null, RATE_CARD);
    }

    const later = new Date(NOW.getTime() + 61_000);
    expect(() => reserve(budget, { now: later })).not.toThrow();
  });

  it("allows one concurrent request and frees the slot on settle", () => {
    const budget = new CoachAIBudget();
    const held = reserve(budget);

    expect(budget.snapshot().activeRequests).toBe(1);
    expect(code(() => reserve(budget))).toBe("concurrency_limited");

    budget.settle(held, null, RATE_CARD);
    expect(budget.snapshot().activeRequests).toBe(0);
    expect(() => reserve(budget)).not.toThrow();
  });
});

describe("reconciliation", () => {
  it("charges reported usage when the provider reports it", () => {
    const budget = new CoachAIBudget();
    const reservation = reserve(budget);

    const settlement = budget.settle(
      reservation,
      { inputTokens: 1_000, outputTokens: 500 },
      RATE_CARD,
    );

    expect(settlement).toEqual({
      chargedMicroUsd: 3_000 + 7_500,
      reconciled: true,
    });
    expect(budget.snapshot().spentTotalMicroUsd).toBe(10_500);
  });

  it("keeps the whole reservation charged when usage is unknown", () => {
    const budget = new CoachAIBudget();

    expect(budget.settle(reserve(budget), null, RATE_CARD)).toEqual({
      chargedMicroUsd: UPPER_BOUND_MICRO_USD,
      reconciled: false,
    });
    expect(budget.snapshot().spentTotalMicroUsd).toBe(UPPER_BOUND_MICRO_USD);
  });

  it.each<
    [string, { inputTokens: number | null; outputTokens: number | null }]
  >([
    ["only input tokens", { inputTokens: 1_000, outputTokens: null }],
    ["only output tokens", { inputTokens: null, outputTokens: 500 }],
    ["a fractional count", { inputTokens: 1_000.5, outputTokens: 500 }],
    ["a negative count", { inputTokens: -1, outputTokens: 500 }],
  ])("keeps the reservation charged on %s", (_case, reported) => {
    const budget = new CoachAIBudget();

    expect(
      budget.settle(reserve(budget), reported, RATE_CARD).chargedMicroUsd,
    ).toBe(UPPER_BOUND_MICRO_USD);
  });

  it("keeps the reservation charged when the price changed mid-flight", () => {
    const budget = new CoachAIBudget();
    const reservation = reserve(budget);

    const settlement = budget.settle(
      reservation,
      { inputTokens: 1_000, outputTokens: 500 },
      { ...RATE_CARD, version: "fixture-2026-09" },
    );

    expect(settlement).toEqual({
      chargedMicroUsd: UPPER_BOUND_MICRO_USD,
      reconciled: false,
    });
  });
});
