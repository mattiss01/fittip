import "server-only";

import { CoachAIBudget } from "@/server/ai/budget";
import { COACH_AI_OPERATIONS, type CoachAI } from "@/server/ai/contracts";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import {
  CoachAIService,
  type CoachAIProposalOutcome,
} from "@/server/ai/coach-ai-service";
import {
  readCoachAICredential,
  requireCoachAILiveEnablement,
  resolveCoachAIEnvironment,
} from "@/server/ai/enablement";
import { CoachAIError } from "@/server/ai/errors";
import { FixtureCoachAI } from "@/server/ai/fixtures/fixture-adapter";
import { CoachAIIdempotencyStore } from "@/server/ai/idempotency";
import {
  FIXTURE_COACH_AI_BINDING,
  requireLiveCoachAIModel,
  type CoachAIModelBinding,
} from "@/server/ai/model-binding";
import { OpenAICoachAI } from "@/server/ai/openai-adapter";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { CoachAISpendLedger } from "@/server/ai/spend";
import { staticCoachAIRateCardSource } from "@/server/ai/budget";
import {
  InMemoryCoachAITelemetrySink,
  type CoachAITelemetrySink,
} from "@/server/ai/telemetry";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";

/**
 * The composition root: the first place in FitTip that constructs a real
 * `CoachAIService`.
 *
 * Nothing could be misconfigured before this file existed, because no
 * production code built one. That is precisely why M3-01B's limitation 17
 * lands here. The service takes its adapter, its limits, and its rate card as
 * three separate injected values, and three values that must agree are three
 * values that can disagree. This module is the only place permitted to choose
 * them, and it chooses all three from one binding.
 *
 * The failure it closes: `FITTIP_AI_MODEL=gpt-5.5` — $5.00/$30.00 per million —
 * priced by luna's $0.20/$1.20 card computes a 5,200 micro-USD reservation
 * against a true cost near 130,000. The 2,000,000 daily ceiling would then
 * admit roughly $50 of real spend while recording $2. `requireLiveCoachAIModel`
 * refuses that pairing before an adapter is constructed, so no credential is
 * read, no reservation is made, and no socket is opened.
 *
 * It fails closed in every direction. A missing ledger, an unapproved model, an
 * unreadable runtime policy, and a disabled flag all end the same way: no
 * service, and therefore no call.
 */

export type CoachAIRuntimeMode = "fixture" | "live";

export type CoachAICompositionInput = {
  owner: CoachAIOwner;
  contextSource: CoachAIContextSource;
  /**
   * Required for a live service and unused by a fixture one. The type keeps it
   * optional because a fixture run genuinely has no ledger; `#run` inside the
   * service refuses any non-network-free adapter without it, and this module
   * refuses before that.
   */
  spendLedger?: CoachAISpendLedger;
  telemetry?: CoachAITelemetrySink;
  /**
   * The fixture case to answer with. Present only in a fixture composition;
   * naming one has no effect on a live service.
   */
  fixtureCaseName?: string;
  environment?: Record<string, string | undefined>;
  clock?: () => Date;
  requestIds?: () => string;
};

export type CoachAIComposition = {
  service: CoachAIService;
  mode: CoachAIRuntimeMode;
  binding: CoachAIModelBinding;
  telemetry: CoachAITelemetrySink;
};

/**
 * Whether this runtime is permitted to make a live call at all.
 *
 * Read before anything is constructed and deliberately conservative: an
 * unreadable runtime policy resolves to `fixture`, because an ambiguous
 * environment is one that never calls out.
 */
export function resolveCoachAIRuntimeMode(
  environment: Record<string, string | undefined> = process.env,
): CoachAIRuntimeMode {
  if (environment.FITTIP_AI_LIVE?.trim() !== "enabled") return "fixture";
  try {
    const policy = readRuntimePolicy(environment);
    return resolveCoachAIEnvironment(environment, policy) ? "live" : "fixture";
  } catch {
    return "fixture";
  }
}

/**
 * Builds the roadmap coaching service, or refuses.
 *
 * The order matters. The enablement gate runs first, so an owner outside the
 * allowlist or a runtime outside M0-06A's founder project is refused before any
 * model is resolved. The model/rate-card pairing is checked next, before the
 * credential is read and before an adapter exists. The ledger is checked last,
 * because a deployment missing it is misconfigured rather than unauthorized.
 */
export function createRoadmapCoachAIService(
  input: CoachAICompositionInput,
): CoachAIComposition {
  const environment = input.environment ?? process.env;
  const telemetry = input.telemetry ?? new InMemoryCoachAITelemetrySink();
  const mode = resolveCoachAIRuntimeMode(environment);

  const clock = input.clock ?? (() => new Date());
  const requestIds = input.requestIds ?? (() => globalThis.crypto.randomUUID());

  if (mode === "fixture") {
    const binding = FIXTURE_COACH_AI_BINDING;
    const adapter: CoachAI = new FixtureCoachAI(
      Object.fromEntries(
        COACH_AI_OPERATIONS.map((operation) => [
          operation,
          { caseName: input.fixtureCaseName ?? "valid_roadmap" },
        ]),
      ),
    );

    return {
      mode,
      binding,
      telemetry,
      service: new CoachAIService({
        adapter,
        contextSource: input.contextSource,
        limits: binding.limits,
        budget: new CoachAIBudget(),
        idempotency: new CoachAIIdempotencyStore<CoachAIProposalOutcome>(),
        telemetry,
        rateCard: staticCoachAIRateCardSource(binding.rateCard),
        clock,
        requestIds,
        environment,
      }),
    };
  }

  // Owner allowlist, runtime, live flag, public-variable leak check, operation
  // allowlist, and credential presence. It returns the configured provider and
  // model codes without returning the credential itself.
  const enablement = requireCoachAILiveEnablement({
    operation: "create_roadmap",
    ownerId: input.owner.id,
    environment,
  });

  // M3-01B limitation 17. The model and the card that prices it are one value,
  // and a pairing nobody approved never reaches an adapter.
  const binding = requireLiveCoachAIModel(
    enablement.providerCode,
    enablement.modelCode,
  );

  if (!input.spendLedger) {
    // The in-memory budget resets on a cold start, so without durable state the
    // daily ceiling never binds. Refusing costs a misconfigured deployment its
    // coaching feature; not refusing costs it the ceiling.
    throw new CoachAIError("budget_unavailable");
  }

  // Read last, and only from the module that owns the variable's name. By this
  // point the owner, the runtime, the operation, the model and the ledger have
  // all been accepted, so the credential is fetched for a call that is already
  // permitted rather than as part of deciding whether it is.
  const adapter = new OpenAICoachAI({
    apiKey: readCoachAICredential(environment),
    modelCode: binding.modelCode,
  });

  return {
    mode,
    binding,
    telemetry,
    service: new CoachAIService({
      adapter,
      contextSource: input.contextSource,
      limits: binding.limits,
      budget: new CoachAIBudget(),
      idempotency: new CoachAIIdempotencyStore<CoachAIProposalOutcome>(),
      spendLedger: input.spendLedger,
      telemetry,
      rateCard: staticCoachAIRateCardSource(binding.rateCard),
      clock,
      requestIds,
      environment,
    }),
  };
}
