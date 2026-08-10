import "server-only";

import {
  COACH_AI_PROMPT_VERSIONS,
  COACH_AI_SCHEMA_VERSIONS,
  isCoachAIOperation,
  type CoachAI,
  type CoachAICandidate,
  type CoachAIEnvironment,
  type CoachAIOperation,
  type CoachAIProposal,
  type CoachAIRequest,
} from "@/server/ai/contracts";
import {
  CoachAIBudget,
  type CoachAILimits,
  type CoachAIRateCard,
  type CoachAIRateCardSource,
  type CoachAIReservation,
  type CoachAISettlement,
} from "@/server/ai/budget";
import { buildCoachAIContext } from "@/server/ai/context";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import { requireCoachAILiveEnablement } from "@/server/ai/enablement";
import { CoachAIError } from "@/server/ai/errors";
import { isNetworkFreeCoachAI } from "@/server/ai/network-free-adapters";
import type { CoachAISpendHandle, CoachAISpendLedger } from "@/server/ai/spend";
import {
  buildCoachAIIdempotencyKey,
  CoachAIIdempotencyStore,
  isCoachAIIdempotencyKey,
} from "@/server/ai/idempotency";
import type { CoachAIOwner } from "@/server/ai/owner";
import {
  validateCoachAICandidate,
  type CoachAIRejectionReason,
} from "@/server/ai/output-validation";
import {
  type CoachAITelemetryOutcome,
  type CoachAITelemetryRecord,
  type CoachAITelemetrySink,
} from "@/server/ai/telemetry";

/**
 * The domain service. It owns everything an adapter must not: authorization,
 * enablement, context selection, limits, the single attempt, validation, and
 * the decision that a validated candidate is still only a proposal.
 *
 * Every dependency is injected — clock, ids, deadline, budget, idempotency,
 * telemetry, rate card, adapter — so a test is deterministic without a timer,
 * a socket, or shared module state.
 */

export type CoachAIProposalOutcome = {
  status: "proposal";
  requestId: string;
  operation: CoachAIOperation;
  idempotencyKey: string;
  proposal: CoachAIProposal;
  /**
   * Which owner-scoped records informed the proposal. Returned to the domain
   * caller for provenance; deliberately absent from telemetry.
   */
  references: { goalIds: string[]; memoryIds: string[] };
};

export type CoachAIServiceDependencies = {
  adapter: CoachAI;
  contextSource: CoachAIContextSource;
  limits: CoachAILimits;
  budget: CoachAIBudget;
  idempotency: CoachAIIdempotencyStore<CoachAIProposalOutcome>;
  /**
   * Durable, fail-closed spend state. Absent for a fixture run, which reaches
   * nothing and spends nothing; required for any hosted one, because the
   * in-memory budget does not survive an instance change.
   */
  spendLedger?: CoachAISpendLedger;
  telemetry: CoachAITelemetrySink;
  rateCard: CoachAIRateCardSource;
  clock: () => Date;
  requestIds: () => string;
  /** Injected in tests; the default races a real, always-cleared timer. */
  deadline?: (ms: number) => Promise<never>;
  environment?: Record<string, string | undefined>;
};

export type CoachAIProposalInput = {
  operation: CoachAIOperation;
  /** Only obtainable from `verifyCoachAIOwner`, so ownership cannot be asserted. */
  owner: CoachAIOwner;
  idempotencyKey?: string;
};

export class CoachAIService {
  constructor(private readonly deps: CoachAIServiceDependencies) {}

  async propose(input: CoachAIProposalInput): Promise<CoachAIProposalOutcome> {
    const startedAt = this.deps.clock();
    const requestId = this.deps.requestIds();
    const draft: CoachAITelemetryRecord = {
      requestId,
      idempotencyKey: null,
      environment: null,
      operation: isCoachAIOperation(input.operation) ? input.operation : null,
      adapterKind: this.deps.adapter.kind,
      providerCode: this.deps.adapter.providerCode,
      modelCode: this.deps.adapter.modelCode,
      promptVersion: null,
      schemaVersion: null,
      startedAt: startedAt.toISOString(),
      latencyMs: 0,
      attemptCount: 0,
      contextGoalCount: null,
      contextMemoryCount: null,
      contextBytes: null,
      reportedInputTokens: null,
      reportedOutputTokens: null,
      estimatedCostMicroUsd: null,
      chargedCostMicroUsd: null,
      currency: null,
      rateCardVersion: null,
      costReconciled: null,
      outcome: "failed",
      rejectionReason: null,
      errorCode: null,
    };

    try {
      const outcome = await this.#run(input, requestId, startedAt, draft);
      return outcome;
    } catch (error) {
      draft.outcome = "failed";
      draft.errorCode =
        error instanceof CoachAIError ? error.code : "provider_unavailable";
      throw error;
    } finally {
      draft.latencyMs = Math.max(
        0,
        this.deps.clock().getTime() - startedAt.getTime(),
      );
      this.deps.telemetry.record(draft);
    }
  }

  async #run(
    input: CoachAIProposalInput,
    requestId: string,
    startedAt: Date,
    draft: CoachAITelemetryRecord,
  ): Promise<CoachAIProposalOutcome> {
    const operation = input.operation;
    if (!isCoachAIOperation(operation)) {
      throw new CoachAIError("invalid_input");
    }

    const schemaVersion = COACH_AI_SCHEMA_VERSIONS[operation];
    const promptVersion = COACH_AI_PROMPT_VERSIONS[operation];
    draft.schemaVersion = schemaVersion;
    draft.promptVersion = promptVersion;

    // Deny by default. The gate is skipped only for an adapter on the explicit
    // network-free allowlist, which is keyed on constructor identity rather
    // than on `kind` — `kind` is something an adapter asserts about itself, so
    // a provider adapter copy-pasted from `FixtureCoachAI` would have inherited
    // an exemption it does not deserve. A fixture adapter still skips the gate:
    // it reaches nothing and spends nothing, and a control that is a nuisance
    // is the kind people disable.
    let environment: CoachAIEnvironment = "local";
    if (!isNetworkFreeCoachAI(this.deps.adapter)) {
      const enablement = requireCoachAILiveEnablement({
        operation,
        ownerId: input.owner.id,
        environment: this.deps.environment,
      });
      environment = enablement.environment;
    }
    draft.environment = environment;

    const records = await this.deps.contextSource.load(input.owner);
    if (records.ownerId !== input.owner.id) {
      // The context source must never hand back another owner's records.
      throw new CoachAIError("context_invalid");
    }

    const assembled = buildCoachAIContext(operation, records);
    draft.contextGoalCount =
      assembled.context.targetableGoals.length +
      assembled.context.historicalGoals.length;
    draft.contextMemoryCount = assembled.context.memory.length;
    draft.contextBytes = assembled.serializedBytes;

    const fingerprint = buildCoachAIIdempotencyKey({
      ownerId: records.ownerId,
      operation,
      schemaVersion,
      goalCollectionRevision: records.goalCollectionRevision,
      memoryCollectionRevision: records.memoryCollectionRevision,
    });
    const key = input.idempotencyKey ?? fingerprint;
    if (!isCoachAIIdempotencyKey(key)) {
      throw new CoachAIError("invalid_input");
    }
    draft.idempotencyKey = key;

    const begun = this.deps.idempotency.begin(key, fingerprint);
    if (begun.state === "replayed") {
      draft.outcome = "replayed";
      return begun.result;
    }
    if (begun.state === "joined") {
      // Joins the single in-flight attempt: no second provider call and no
      // second reservation.
      draft.outcome = "replayed";
      return begun.pending;
    }

    try {
      const outcome = await this.#attempt({
        operation,
        owner: input.owner,
        requestId,
        startedAt,
        environment,
        schemaVersion,
        promptVersion,
        key,
        assembled,
        draft,
      });
      begun.complete(outcome);
      return outcome;
    } catch (error) {
      begun.fail(error);
      throw error;
    }
  }

  async #attempt(input: {
    operation: CoachAIOperation;
    owner: CoachAIOwner;
    requestId: string;
    startedAt: Date;
    environment: CoachAIEnvironment;
    schemaVersion: string;
    promptVersion: string;
    key: string;
    assembled: ReturnType<typeof buildCoachAIContext>;
    draft: CoachAITelemetryRecord;
  }): Promise<CoachAIProposalOutcome> {
    const { draft, assembled, operation } = input;
    const limits = this.deps.limits;
    const rateCard = this.deps.rateCard();

    const reservation: CoachAIReservation = this.deps.budget.reserve({
      ownerId: input.owner.id,
      operation,
      now: this.deps.clock(),
      limits,
      rateCard,
    });
    draft.estimatedCostMicroUsd = reservation.reservedMicroUsd;
    draft.rateCardVersion = reservation.rateCardVersion;
    draft.currency = reservation.currency;

    // The in-memory reserve runs first because it holds the rate and
    // concurrency limits the durable ledger does not, and refusing locally
    // costs no round trip. The ledger's ceilings are the authoritative ones:
    // they are enforced inside the database, where the capped owner cannot
    // reach them.
    const ledger = this.deps.spendLedger;
    let durable: CoachAISpendHandle | null = null;
    if (ledger) {
      try {
        durable = await ledger.reserve({
          operation,
          reservedMicroUsd: reservation.reservedMicroUsd,
          rateCardVersion: reservation.rateCardVersion,
          currency: reservation.currency,
        });
      } catch (error) {
        // No provider call was made, so nothing was spent. Releasing the
        // in-memory hold keeps a durable refusal from also consuming the local
        // ceiling and the concurrency slot.
        this.deps.budget.settle(
          reservation,
          { inputTokens: 0, outputTokens: 0 },
          rateCard,
        );
        throw error;
      }
    }

    const request: CoachAIRequest = {
      requestId: input.requestId,
      ownerId: input.owner.id,
      operation,
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      environment: input.environment,
      requestedAt: input.startedAt.toISOString(),
      idempotencyKey: input.key,
      maxInputTokens: limits.maxInputTokens,
      maxOutputTokens: limits.maxOutputTokens,
      deadlineMs: limits.deadlineMs,
      context: assembled.context,
    };

    // Held in an object so that assigning it from the callback below does not
    // leave the compiler narrowing it to `null` at every later use.
    const state: {
      settlement: CoachAISettlement | null;
      durableSettlement: Promise<void> | null;
    } = { settlement: null, durableSettlement: null };

    const settleOnce = (result: CoachAICandidate | null): CoachAISettlement => {
      if (state.settlement) return state.settlement;
      const settled = this.deps.budget.settle(
        reservation,
        result
          ? {
              inputTokens: result.reportedInputTokens,
              outputTokens: result.reportedOutputTokens,
            }
          : null,
        rateCard,
      );
      state.settlement = settled;
      if (ledger && durable) {
        state.durableSettlement = ledger
          .settle(durable, settled.chargedMicroUsd)
          .catch(() => {
            // Best effort by design. The reservation expires on its own, so a
            // failed settlement releases the hold rather than stranding it, and
            // it must not turn a completed proposal into a failed one.
          });
      }
      return settled;
    };

    // Exactly one attempt. An automatic retry would need approved idempotency
    // and billing behavior, and decision 5 settled that there is none: a call
    // that fails after the provider generated a response has already been
    // charged.
    draft.attemptCount = 1;
    const call =
      operation === "create_roadmap"
        ? this.deps.adapter.createRoadmap(request)
        : this.deps.adapter.createSevenDayPlan(request);

    // Settlement is attached to the provider call, not to the deadline race.
    // `maxConcurrentRequests` counts reservations, so releasing the slot when
    // the deadline fires would admit a second request while the first is still
    // live and still billable at the provider. Spend ceilings hold either way;
    // the concurrency guarantee does not.
    void call.then(
      (result) => settleOnce(result),
      () => settleOnce(null),
    );

    let candidate: CoachAICandidate;
    try {
      candidate = await this.#withDeadline(call, limits.deadlineMs);
    } catch (error) {
      // On a deadline the call is still running, so the real charge is not yet
      // known and the slot stays held until it ends. The reservation is what is
      // owed meanwhile: a failed call is not a free call. If this runtime never
      // sees the call end, the durable reservation's expiry releases it.
      draft.chargedCostMicroUsd =
        state.settlement?.chargedMicroUsd ?? reservation.reservedMicroUsd;
      draft.costReconciled = state.settlement?.reconciled ?? false;
      throw error;
    }

    const settlement = settleOnce(candidate);
    draft.chargedCostMicroUsd = settlement.chargedMicroUsd;
    draft.costReconciled = settlement.reconciled;
    draft.reportedInputTokens = candidate.reportedInputTokens;
    draft.reportedOutputTokens = candidate.reportedOutputTokens;
    // Awaited on the path that has somewhere to await it, so a serverless
    // instance cannot be frozen between the provider response and the write
    // that records what it cost.
    if (state.durableSettlement) await state.durableSettlement;

    const validation = validateCoachAICandidate({
      operation,
      body: candidate.body,
      context: assembled.context,
    });

    if (validation.outcome === "rejected") {
      draft.outcome = "rejected";
      draft.rejectionReason = validation.reason as CoachAIRejectionReason;
      // A rejected candidate creates no proposal and writes no user data.
      throw new CoachAIError("output_invalid");
    }

    draft.outcome = "accepted";
    return {
      status: "proposal",
      requestId: input.requestId,
      operation,
      idempotencyKey: input.key,
      proposal: validation.proposal,
      references: assembled.references,
    };
  }

  #withDeadline<Value>(promise: Promise<Value>, ms: number): Promise<Value> {
    if (this.deps.deadline) {
      return Promise.race([promise, this.deps.deadline(ms)]);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new CoachAIError("deadline_exceeded")),
        ms,
      );
    });
    // The timer is always cleared, so a resolved call leaves nothing pending.
    expiry.catch(() => {});
    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
  }
}

export type { CoachAIRateCard, CoachAITelemetryOutcome };
