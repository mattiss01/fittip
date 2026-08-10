import { describe, expect, it, vi } from "vitest";

import {
  CoachAIBudget,
  COACH_AI_FIXTURE_LIMITS,
  type CoachAILimits,
  type CoachAIRateCard,
} from "@/server/ai/budget";
import {
  CoachAIService,
  type CoachAIProposalOutcome,
} from "@/server/ai/coach-ai-service";
import type {
  CoachAIGoalRecord,
  CoachAIOwnedRecords,
} from "@/server/ai/context";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import type {
  CoachAI,
  CoachAICandidate,
  CoachAIRequest,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import { FixtureCoachAI } from "@/server/ai/fixtures/fixture-adapter";
import {
  COACH_AI_FIXTURE_HISTORICAL_GOAL_ID,
  COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
  COACH_AI_FIXTURE_TODAY,
} from "@/server/ai/fixtures/fixture-corpus";
import { CoachAIIdempotencyStore } from "@/server/ai/idempotency";
import type { CoachAIOwner } from "@/server/ai/owner";
import type {
  CoachAISpendHandle,
  CoachAISpendLedger,
  CoachAISpendReservationInput,
} from "@/server/ai/spend";
import { InMemoryCoachAITelemetrySink } from "@/server/ai/telemetry";
import type { MemoryItemView } from "@/server/memory/memory-records";

const OWNER_ID = "53000000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;
const OTHER_OWNER = {
  id: "53000000-0000-4000-8000-000000000002",
} as unknown as CoachAIOwner;
const NOW = new Date("2026-08-04T09:00:00.000Z");
const MEMORY_CONTENT = "Trains before work on weekdays.";
const GOAL_TITLE = "Run a hilly half marathon";

const RATE_CARD: CoachAIRateCard = {
  version: "fixture-2026-08",
  currency: "USD",
  inputMicroUsdPerMillionTokens: 3_000_000,
  outputMicroUsdPerMillionTokens: 15_000_000,
  validUntil: "2026-09-01T00:00:00.000Z",
};

class FakeContextSource implements CoachAIContextSource {
  goalCollectionRevision = 3;
  memoryCollectionRevision = 5;
  ownerIdOverride: string | null = null;
  readonly calls: string[] = [];

  async load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords> {
    this.calls.push(owner.id);
    return {
      ownerId: this.ownerIdOverride ?? owner.id,
      today: COACH_AI_FIXTURE_TODAY,
      goalCollectionRevision: this.goalCollectionRevision,
      memoryCollectionRevision: this.memoryCollectionRevision,
      goals: [targetableGoal(), historicalGoal()],
      memory: [memoryItem()],
    };
  }
}

/** A provider-kind adapter that records whether it was ever reached. */
class SpyProviderCoachAI implements CoachAI {
  readonly kind = "provider" as const;
  readonly providerCode = "spy-provider";
  readonly modelCode = "spy-model";
  invocations = 0;

  constructor(private readonly resolve: () => Promise<CoachAICandidate>) {}

  createRoadmap(request: CoachAIRequest): Promise<CoachAICandidate> {
    void request;
    this.invocations += 1;
    return this.resolve();
  }

  createSevenDayPlan(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.createRoadmap(request);
  }
}

/**
 * An adapter asserting `kind: "fixture"` while being something else entirely —
 * the copy-paste M3-01's review predicted. It must still meet the live gate.
 */
class ImpostorCoachAI implements CoachAI {
  readonly kind = "fixture" as const;
  readonly providerCode = "fixture";
  readonly modelCode = "fixture-corpus-v1";
  invocations = 0;

  createRoadmap(request: CoachAIRequest): Promise<CoachAICandidate> {
    void request;
    this.invocations += 1;
    return Promise.resolve({
      body: "{}",
      reportedInputTokens: null,
      reportedOutputTokens: null,
    });
  }

  createSevenDayPlan(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.createRoadmap(request);
  }
}

class FakeSpendLedger implements CoachAISpendLedger {
  readonly reserved: CoachAISpendReservationInput[] = [];
  readonly settled: number[] = [];
  refuseWith: CoachAIError | null = null;

  async reserve(
    input: CoachAISpendReservationInput,
  ): Promise<CoachAISpendHandle> {
    if (this.refuseWith) throw this.refuseWith;
    this.reserved.push(input);
    return {
      reservationId: "44444444-4444-4444-8444-444444444444",
      settlementToken: "55555555-5555-4555-8555-555555555555",
      spendDay: "2026-08-04",
      reservedMicroUsd: input.reservedMicroUsd,
      expiresAt: "2026-08-04T09:15:00.000Z",
    };
  }

  async settle(
    handle: CoachAISpendHandle,
    chargedMicroUsd: number,
  ): Promise<void> {
    void handle;
    this.settled.push(chargedMicroUsd);
  }
}

function build(
  overrides: {
    adapter?: CoachAI;
    contextSource?: FakeContextSource;
    rateCard?: CoachAIRateCard | null;
    limits?: Partial<CoachAILimits>;
    deadline?: (ms: number) => Promise<never>;
    environment?: Record<string, string | undefined>;
    spendLedger?: CoachAISpendLedger;
  } = {},
) {
  const contextSource = overrides.contextSource ?? new FakeContextSource();
  const telemetry = new InMemoryCoachAITelemetrySink();
  const budget = new CoachAIBudget();
  let nextId = 0;

  const service = new CoachAIService({
    adapter:
      overrides.adapter ??
      new FixtureCoachAI({
        create_roadmap: { caseName: "valid_roadmap" },
        create_seven_day_plan: { caseName: "valid_seven_day_plan" },
      }),
    contextSource,
    limits: { ...COACH_AI_FIXTURE_LIMITS, ...overrides.limits },
    budget,
    idempotency: new CoachAIIdempotencyStore<CoachAIProposalOutcome>(),
    telemetry,
    rateCard: () =>
      overrides.rateCard === undefined ? RATE_CARD : overrides.rateCard,
    clock: () => NOW,
    requestIds: () => {
      nextId += 1;
      return `request-${nextId}`;
    },
    ...(overrides.deadline ? { deadline: overrides.deadline } : {}),
    ...(overrides.environment ? { environment: overrides.environment } : {}),
    ...(overrides.spendLedger ? { spendLedger: overrides.spendLedger } : {}),
  });

  return { service, telemetry, budget, contextSource };
}

async function failureCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CoachAIError) return error.code;
    throw error;
  }
  throw new Error("expected the coaching service to deny");
}

describe("a successful proposal", () => {
  it("returns a validated proposal and the records that informed it", async () => {
    const { service, telemetry } = build();

    const outcome = await service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });

    expect(outcome.status).toBe("proposal");
    expect(outcome.references).toEqual({
      goalIds: [
        COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
        COACH_AI_FIXTURE_HISTORICAL_GOAL_ID,
      ],
      memoryIds: ["c3000000-0000-4000-8000-000000000001"],
    });
    expect(telemetry.records.at(-1)).toMatchObject({
      outcome: "accepted",
      attemptCount: 1,
      adapterKind: "fixture",
      schemaVersion: "fittip.roadmap.v1",
      contextGoalCount: 2,
      contextMemoryCount: 1,
    });
  });

  it("makes exactly one attempt and never retries", async () => {
    const adapter = new FixtureCoachAI({
      create_roadmap: { caseName: "valid_roadmap" },
    });
    const spy = vi.spyOn(adapter, "createRoadmap");
    const { service } = build({ adapter });

    await service.propose({ operation: "create_roadmap", owner: OWNER });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("charges the reservation and reconciles reported usage", async () => {
    const { service, budget, telemetry } = build({
      adapter: new FixtureCoachAI({
        create_roadmap: {
          caseName: "valid_roadmap",
          reportedInputTokens: 1_000,
          reportedOutputTokens: 500,
        },
      }),
    });

    await service.propose({ operation: "create_roadmap", owner: OWNER });

    expect(telemetry.records.at(-1)).toMatchObject({
      estimatedCostMicroUsd: 54_000,
      chargedCostMicroUsd: 10_500,
      costReconciled: true,
      currency: "USD",
      rateCardVersion: "fixture-2026-08",
    });
    expect(budget.snapshot()).toMatchObject({
      spentTotalMicroUsd: 10_500,
      activeRequests: 0,
    });
  });
});

describe("gates before the adapter", () => {
  it("denies a provider adapter with no live enablement, without invoking it", async () => {
    const adapter = new SpyProviderCoachAI(() =>
      Promise.resolve({
        body: "{}",
        reportedInputTokens: null,
        reportedOutputTokens: null,
      }),
    );
    const { service, budget } = build({ adapter, environment: {} });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("not_enabled");
    expect(adapter.invocations).toBe(0);
    expect(budget.snapshot().spentTotalMicroUsd).toBe(0);
  });

  it("denies when no price is known, without invoking the adapter", async () => {
    const adapter = new FixtureCoachAI({
      create_roadmap: { caseName: "valid_roadmap" },
    });
    const spy = vi.spyOn(adapter, "createRoadmap");
    const { service } = build({ adapter, rateCard: null });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("budget_unavailable");
    expect(spy).not.toHaveBeenCalled();
  });

  it("stops an owner at the rate ceiling", async () => {
    const { service, contextSource } = build();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      contextSource.goalCollectionRevision = attempt;
      await service.propose({ operation: "create_roadmap", owner: OWNER });
    }

    contextSource.goalCollectionRevision = 99;
    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("rate_limited");
  });

  it("refuses records that belong to somebody else", async () => {
    const contextSource = new FakeContextSource();
    contextSource.ownerIdOverride = OTHER_OWNER.id;
    const { service } = build({ contextSource });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("context_invalid");
  });

  it("reads context under the owner it was given", async () => {
    const { service, contextSource } = build();

    await service.propose({ operation: "create_roadmap", owner: OWNER });
    await service.propose({ operation: "create_roadmap", owner: OTHER_OWNER });

    expect(contextSource.calls).toEqual([OWNER.id, OTHER_OWNER.id]);
  });
});

describe("idempotency across requests", () => {
  it("replays a completed identical request without a second attempt", async () => {
    const adapter = new FixtureCoachAI({
      create_roadmap: { caseName: "valid_roadmap" },
    });
    const spy = vi.spyOn(adapter, "createRoadmap");
    const { service, budget, telemetry } = build({ adapter });

    const first = await service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });
    const second = await service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });

    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(budget.snapshot().spentTotalMicroUsd).toBe(54_000);
    expect(telemetry.records.at(-1)?.outcome).toBe("replayed");
  });

  it("collapses concurrent duplicates onto one attempt and one charge", async () => {
    let release: (candidate: CoachAICandidate) => void = () => {};
    const pending = new Promise<CoachAICandidate>((resolve) => {
      release = resolve;
    });
    const adapter = new SpyProviderCoachAI(() => pending);
    // A provider-kind adapter with the live gate satisfied, so the concurrency
    // behavior is proven on the path that would really call out.
    const { service, budget } = build({
      adapter,
      environment: {
        FITTIP_AI_LIVE: "enabled",
        FITTIP_AI_OWNER_ALLOWLIST: OWNER_ID,
        FITTIP_AI_OPERATIONS: "create_roadmap",
        FITTIP_AI_PROVIDER: "example-provider",
        FITTIP_AI_MODEL: "example-model-1",
        FITTIP_AI_API_KEY: "not-a-real-key-0000000000000000",
      },
    });

    const first = service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });
    const second = service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });

    release({
      body: JSON.stringify({
        schemaVersion: "fittip.roadmap.v1",
        summary: "One phase to the race.",
        phases: [
          {
            title: "Aerobic base",
            focus: "Easy volume.",
            startDate: "2026-08-04",
            endDate: "2026-09-14",
            goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
          },
        ],
      }),
      reportedInputTokens: null,
      reportedOutputTokens: null,
    });

    expect(await second).toBe(await first);
    expect(adapter.invocations).toBe(1);
    expect(budget.snapshot().spentTotalMicroUsd).toBe(54_000);
  });

  it("treats a reused caller key over changed context as a conflict", async () => {
    const { service, contextSource } = build();
    const key = "caller-supplied-key-000000000001";

    await service.propose({
      operation: "create_roadmap",
      owner: OWNER,
      idempotencyKey: key,
    });

    contextSource.goalCollectionRevision = 4;
    expect(
      await failureCode(() =>
        service.propose({
          operation: "create_roadmap",
          owner: OWNER,
          idempotencyKey: key,
        }),
      ),
    ).toBe("idempotency_conflict");
  });

  it("refuses a caller key that is not a usable key", async () => {
    const { service } = build();

    expect(
      await failureCode(() =>
        service.propose({
          operation: "create_roadmap",
          owner: OWNER,
          idempotencyKey: "short",
        }),
      ),
    ).toBe("invalid_input");
  });

  it("lets the owner retry after a failure rather than caching it", async () => {
    const adapter = new FixtureCoachAI({
      create_roadmap: { failWith: "unavailable" },
    });
    const { service } = build({ adapter });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("provider_unavailable");
    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("provider_unavailable");
  });
});

describe("failure handling", () => {
  it("rejects invalid output, creates no proposal, and still charges", async () => {
    const { service, budget, telemetry } = build({
      adapter: new FixtureCoachAI({
        create_seven_day_plan: { caseName: "unsafe_medical_phrasing" },
      }),
    });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_seven_day_plan", owner: OWNER }),
      ),
    ).toBe("output_invalid");

    expect(telemetry.records.at(-1)).toMatchObject({
      outcome: "failed",
      rejectionReason: "unsafe_content",
      errorCode: "output_invalid",
    });
    // A call that produced nothing usable was still a call.
    expect(budget.snapshot()).toMatchObject({
      spentTotalMicroUsd: 54_000,
      activeRequests: 0,
    });
  });

  it("frees the concurrency slot when the adapter fails", async () => {
    const { service, budget } = build({
      adapter: new FixtureCoachAI({
        create_roadmap: { failWith: "unavailable" },
      }),
    });

    await failureCode(() =>
      service.propose({ operation: "create_roadmap", owner: OWNER }),
    );

    expect(budget.snapshot().activeRequests).toBe(0);
  });

  it("stops at the deadline and charges the unreconciled reservation", async () => {
    let release: (candidate: CoachAICandidate) => void = () => {};
    const adapter = new SpyProviderCoachAI(
      () =>
        new Promise<CoachAICandidate>((resolve) => {
          release = resolve;
        }),
    );
    const { service, budget, telemetry } = build({
      adapter,
      // Deterministic: no wall-clock timer decides this test.
      deadline: () => Promise.reject(new CoachAIError("deadline_exceeded")),
      environment: {
        FITTIP_AI_LIVE: "enabled",
        FITTIP_AI_OWNER_ALLOWLIST: OWNER_ID,
        FITTIP_AI_OPERATIONS: "create_roadmap",
        FITTIP_AI_PROVIDER: "example-provider",
        FITTIP_AI_MODEL: "example-model-1",
        FITTIP_AI_API_KEY: "not-a-real-key-0000000000000000",
      },
    });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("deadline_exceeded");

    expect(telemetry.records.at(-1)).toMatchObject({
      outcome: "failed",
      errorCode: "deadline_exceeded",
      chargedCostMicroUsd: 54_000,
      costReconciled: false,
    });
    // Carried forward from M3-01's independent review. The concurrency slot is
    // released when the provider call actually ends, not when the deadline
    // fires: a timed-out request is still running and still billable at the
    // provider, so freeing the slot here would admit a second live call
    // alongside it. Spend ceilings held either way; the concurrency guarantee
    // did not.
    expect(budget.snapshot().activeRequests).toBe(1);

    release({
      body: "{}",
      reportedInputTokens: null,
      reportedOutputTokens: null,
    });
    await vi.waitFor(() => expect(budget.snapshot().activeRequests).toBe(0));
  });
});

describe("the live gate keys on identity, not on self-declaration", () => {
  it("gates an adapter that calls itself a fixture but is not the fixture one", async () => {
    const adapter = new ImpostorCoachAI();
    const { service, budget } = build({ adapter, environment: {} });

    // M3-01's review: a provider adapter copy-pasted from `FixtureCoachAI`
    // inherits `kind: "fixture"`. Under the old gate it would have called out
    // with no live flag, no allowlist, and no credential check.
    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("not_enabled");
    expect(adapter.invocations).toBe(0);
    expect(budget.snapshot().spentTotalMicroUsd).toBe(0);
  });

  it("still lets the real fixture adapter run without a credential", async () => {
    const { service } = build({ environment: {} });

    // The exemption is a fact about the module graph, not a claim in a field.
    const outcome = await service.propose({
      operation: "create_roadmap",
      owner: OWNER,
    });
    expect(outcome.status).toBe("proposal");
  });
});

describe("durable spend", () => {
  it("reserves durably before the call and settles what it cost", async () => {
    const ledger = new FakeSpendLedger();
    const { service, telemetry } = build({ spendLedger: ledger });

    await service.propose({ operation: "create_roadmap", owner: OWNER });

    expect(ledger.reserved).toEqual([
      {
        operation: "create_roadmap",
        reservedMicroUsd: 54_000,
        rateCardVersion: "fixture-2026-08",
        currency: "USD",
      },
    ]);
    // Unknown usage is never treated as zero, so the whole reservation stands.
    expect(ledger.settled).toEqual([54_000]);
    expect(telemetry.records.at(-1)).toMatchObject({
      chargedCostMicroUsd: 54_000,
    });
  });

  it("releases the local hold when the durable ceiling refuses", async () => {
    const ledger = new FakeSpendLedger();
    ledger.refuseWith = new CoachAIError("budget_exhausted");
    const adapter = new FixtureCoachAI({
      create_roadmap: { caseName: "valid_roadmap" },
    });
    const spy = vi.spyOn(adapter, "createRoadmap");
    const { service, budget } = build({ adapter, spendLedger: ledger });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("budget_exhausted");

    expect(spy).not.toHaveBeenCalled();
    // Nothing was called, so nothing was spent and the slot is free again. A
    // durable refusal must not also burn the local ceiling.
    expect(budget.snapshot()).toMatchObject({
      spentTotalMicroUsd: 0,
      activeRequests: 0,
    });
    expect(ledger.settled).toEqual([]);
  });

  it("settles durably only once, however the call ends", async () => {
    const ledger = new FakeSpendLedger();
    const adapter = new FixtureCoachAI({
      create_roadmap: { failWith: "unavailable" },
    });
    const { service } = build({ adapter, spendLedger: ledger });

    expect(
      await failureCode(() =>
        service.propose({ operation: "create_roadmap", owner: OWNER }),
      ),
    ).toBe("provider_unavailable");

    // A failed call is not a free call: the reservation stands in full.
    expect(ledger.settled).toEqual([54_000]);
  });
});

describe("telemetry", () => {
  it("records the technical outcome and none of the content", async () => {
    const { service, telemetry } = build();

    await service.propose({ operation: "create_roadmap", owner: OWNER });

    const serialized = JSON.stringify(telemetry.records);
    expect(serialized).not.toContain(MEMORY_CONTENT);
    expect(serialized).not.toContain(GOAL_TITLE);
    expect(serialized).not.toContain(COACH_AI_FIXTURE_TARGETABLE_GOAL_ID);
    expect(serialized).not.toContain(OWNER_ID);
    expect(serialized).not.toContain("Aerobic base");
  });

  it("records a denial that never reached the adapter", async () => {
    const { service, telemetry } = build({ rateCard: null });

    await failureCode(() =>
      service.propose({ operation: "create_roadmap", owner: OWNER }),
    );

    expect(telemetry.records.at(-1)).toMatchObject({
      outcome: "failed",
      errorCode: "budget_unavailable",
      attemptCount: 0,
    });
  });
});

function targetableGoal(): CoachAIGoalRecord {
  return {
    id: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
    title: GOAL_TITLE,
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-11-15",
    status: "active",
    archivedAt: null,
  };
}

function historicalGoal(): CoachAIGoalRecord {
  return {
    id: COACH_AI_FIXTURE_HISTORICAL_GOAL_ID,
    title: "Hold a 30 second front lever",
    category: "skill",
    priorityTier: "supporting",
    targetDate: null,
    status: "achieved",
    archivedAt: null,
  };
}

function memoryItem(): MemoryItemView {
  return {
    id: "c3000000-0000-4000-8000-000000000001",
    memoryType: "constraint",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: null,
    content: MEMORY_CONTENT,
    revisionNumber: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    history: [],
  };
}
