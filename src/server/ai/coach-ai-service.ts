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

    // The live gate applies to a real provider and only to a real provider. A
    // fixture adapter reaches nothing and spends nothing, so requiring a
    // credential to run one would make the gate a nuisance instead of a
    // control — and a nuisance control is the kind people disable.
    let environment: CoachAIEnvironment = "local";
    if (this.deps.adapter.kind === "provider") {
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

    let candidate: CoachAICandidate | null = null;
    let settlement: CoachAISettlement | null = null;
    try {
      // Exactly one attempt. An automatic retry would need approved
      // idempotency and billing behavior, which M3-01 does not have.
      draft.attemptCount = 1;
      candidate = await this.#withDeadline(
        operation === "create_roadmap"
          ? this.deps.adapter.createRoadmap(request)
          : this.deps.adapter.createSevenDayPlan(request),
        limits.deadlineMs,
      );
    } finally {
      settlement = this.deps.budget.settle(
        reservation,
        candidate
          ? {
              inputTokens: candidate.reportedInputTokens,
              outputTokens: candidate.reportedOutputTokens,
            }
          : null,
        rateCard,
      );
      draft.chargedCostMicroUsd = settlement.chargedMicroUsd;
      draft.costReconciled = settlement.reconciled;
      draft.reportedInputTokens = candidate?.reportedInputTokens ?? null;
      draft.reportedOutputTokens = candidate?.reportedOutputTokens ?? null;
    }

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
