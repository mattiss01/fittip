import { describe, expect, it } from "vitest";

import {
  createRoadmapCoachAIService,
  resolveCoachAIRuntimeMode,
} from "@/server/ai/composition";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import type { CoachAIOwnedRecords } from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import {
  APPROVED_COACH_AI_MODELS,
  requireApprovedCoachAIModel,
  requireLiveCoachAIModel,
} from "@/server/ai/model-binding";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { CoachAISpendHandle, CoachAISpendLedger } from "@/server/ai/spend";

const OWNER_ID = "9f000000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;

class StubContextSource implements CoachAIContextSource {
  async load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords> {
    return {
      ownerId: owner.id,
      today: "2026-08-11",
      goalCollectionRevision: 1,
      memoryCollectionRevision: 1,
      goals: [],
      memory: [],
      training: {
        today: "2026-08-11",
        horizonEndDate: "2026-11-01",
        completions: [],
        plannedSessions: [],
      },
    };
  }
}

class StubSpendLedger implements CoachAISpendLedger {
  async reserve(): Promise<CoachAISpendHandle> {
    return {
      reservationId: "r1",
      settlementToken: "t1",
      spendDay: "2026-08-11",
      reservedMicroUsd: 5_200,
      expiresAt: "2026-08-11T12:00:00.000Z",
    };
  }
  async settle(): Promise<void> {}
}

/** A fully configured live founder runtime, except for the model under test. */
function liveEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    FITTIP_RUNTIME_MODE: "founder-staging",
    FITTIP_OWNER_USER_ID: OWNER_ID,
    VERCEL_ENV: "production",
    FITTIP_AI_LIVE: "enabled",
    FITTIP_AI_OWNER_ALLOWLIST: OWNER_ID,
    FITTIP_AI_OPERATIONS: "create_roadmap",
    FITTIP_AI_PROVIDER: "openai",
    FITTIP_AI_MODEL: "gpt-5.6-luna",
    FITTIP_AI_API_KEY: "not-a-real-key-000000000000000000",
    ...overrides,
  };
}

function compose(environment: Record<string, string | undefined>) {
  return createRoadmapCoachAIService({
    owner: OWNER,
    contextSource: new StubContextSource(),
    spendLedger: new StubSpendLedger(),
    environment,
  });
}

describe("the model is bound to the card that prices it", () => {
  it("resolves an approved pair to one indivisible binding", () => {
    const binding = requireApprovedCoachAIModel("openai", "gpt-5.6-luna");

    // The card cannot be obtained without naming the model, which is the whole
    // of the fix: there is no second constant to drift from this one.
    expect(binding.rateCard.version).toBe("openai-gpt-5.6-luna-2026-08-10");
    expect(binding.rateCard.inputMicroUsdPerMillionTokens).toBe(200_000);
    expect(binding.rateCard.outputMicroUsdPerMillionTokens).toBe(1_200_000);
    expect(binding.limits.maxInputTokens).toBe(10_000);
  });

  it("refuses a model no approved card prices", () => {
    // M3-01B limitation 17, exactly. `gpt-5.5` is $5.00/$30.00 per million: at
    // luna's card every reservation would be priced 25 times low, and the
    // 2,000,000 micro-USD daily ceiling would admit roughly $50 of real spend
    // while recording $2.
    expect(() => requireApprovedCoachAIModel("openai", "gpt-5.5")).toThrow(
      CoachAIError,
    );
    expect(() =>
      requireApprovedCoachAIModel("anthropic", "gpt-5.6-luna"),
    ).toThrow(CoachAIError);
  });

  it("refuses the fixture binding on a live path", () => {
    // A live call priced by the zero-cost fixture card would spend real money
    // and record none of it.
    expect(() =>
      requireLiveCoachAIModel("fixture", "fixture-corpus-v1"),
    ).toThrow(CoachAIError);
  });

  it("prices every approved binding, and prices none of them at zero by accident", () => {
    for (const binding of APPROVED_COACH_AI_MODELS) {
      expect(binding.rateCard.version.length).toBeGreaterThan(0);
      if (binding.reachesNetwork) {
        expect(binding.rateCard.inputMicroUsdPerMillionTokens).toBeGreaterThan(
          0,
        );
        expect(binding.rateCard.outputMicroUsdPerMillionTokens).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe("the live composition root", () => {
  it("builds a live service for the approved model", () => {
    const composition = compose(liveEnvironment());

    expect(composition.mode).toBe("live");
    expect(composition.binding.modelCode).toBe("gpt-5.6-luna");
    expect(composition.binding.rateCard.version).toBe(
      "openai-gpt-5.6-luna-2026-08-10",
    );
  });

  it("refuses to construct a service when the model is not the model its card prices", () => {
    // The refusal this ticket exists to add. It happens before an adapter is
    // constructed, so no credential is read and no socket is opened.
    expect(() =>
      compose(liveEnvironment({ FITTIP_AI_MODEL: "gpt-5.5" })),
    ).toThrow(CoachAIError);

    try {
      compose(liveEnvironment({ FITTIP_AI_MODEL: "gpt-5.5" }));
    } catch (error) {
      // The same code a missing provider gets: a caller learns nothing about
      // which part of the configuration is wrong.
      expect((error as CoachAIError).code).toBe("provider_unconfigured");
    }
  });

  it("refuses an approved model under an unapproved provider", () => {
    expect(() =>
      compose(liveEnvironment({ FITTIP_AI_PROVIDER: "anthropic" })),
    ).toThrow(CoachAIError);
  });

  it("refuses a live service with no durable spend ledger", () => {
    // The in-memory budget resets on a cold start, so without this the daily
    // ceiling never binds.
    expect(() =>
      createRoadmapCoachAIService({
        owner: OWNER,
        contextSource: new StubContextSource(),
        environment: liveEnvironment(),
      }),
    ).toThrow(CoachAIError);
  });

  it("refuses an owner outside the allowlist before resolving a model", () => {
    expect(() =>
      compose(
        liveEnvironment({
          FITTIP_AI_OWNER_ALLOWLIST: "9f000000-0000-4000-8000-0000000000ff",
        }),
      ),
    ).toThrow(CoachAIError);
  });

  it("falls back to the fixture service rather than calling out", () => {
    // Deny by default in the other direction: an unreadable or non-founder
    // runtime produces a service that reaches nothing, not a refusal the owner
    // has to interpret and not a live call.
    for (const environment of [
      {},
      // A Vercel runtime with no founder mode is an ambiguous environment, and
      // an ambiguous environment never calls out.
      { FITTIP_AI_LIVE: "enabled", VERCEL_ENV: "preview" },
      // A Preview deployment is not M0-06A's founder project, whatever else
      // agrees.
      { ...liveEnvironment(), VERCEL_ENV: "preview" },
      { ...liveEnvironment(), FITTIP_AI_LIVE: "disabled" },
      { ...liveEnvironment(), FITTIP_AI_LIVE: undefined },
    ]) {
      expect(resolveCoachAIRuntimeMode(environment)).toBe("fixture");
      const composition = createRoadmapCoachAIService({
        owner: OWNER,
        contextSource: new StubContextSource(),
        environment,
      });
      expect(composition.mode).toBe("fixture");
      expect(composition.binding.reachesNetwork).toBe(false);
      expect(composition.binding.rateCard.version).toBe("fixture-no-spend");
    }
  });

  it("never hands the credential to anything that could return it", () => {
    const composition = compose(liveEnvironment());
    const serialized = JSON.stringify(
      composition.binding,
      (_key, value: unknown) => value,
    );

    expect(serialized).not.toContain("not-a-real-key");
  });
});
