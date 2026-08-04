import "server-only";

import type {
  CoachAIEnvironment,
  CoachAIOperation,
} from "@/server/ai/contracts";
import type { CoachAIErrorCode } from "@/server/ai/errors";
import type { CoachAIRejectionReason } from "@/server/ai/output-validation";

/**
 * Content-free technical telemetry.
 *
 * The point of this record is to answer "which provider, which model, which
 * prompt and schema, how many tokens, what did it cost, did validation pass"
 * without answering "what did the user say". Record ids and counts are here;
 * goal titles, memory text, intake answers, activity names, prompts, provider
 * bodies, raw errors, Auth identity, headers, URLs, and secrets are not.
 *
 * There is no external sink. The default sink is a bounded in-memory buffer.
 */

export const COACH_AI_TELEMETRY_FIELDS = [
  "requestId",
  "idempotencyKey",
  "environment",
  "operation",
  "adapterKind",
  "providerCode",
  "modelCode",
  "promptVersion",
  "schemaVersion",
  "startedAt",
  "latencyMs",
  "attemptCount",
  "contextGoalCount",
  "contextMemoryCount",
  "contextBytes",
  "reportedInputTokens",
  "reportedOutputTokens",
  "estimatedCostMicroUsd",
  "chargedCostMicroUsd",
  "currency",
  "rateCardVersion",
  "costReconciled",
  "outcome",
  "rejectionReason",
  "errorCode",
] as const;

export type CoachAITelemetryOutcome =
  | "accepted"
  | "rejected"
  | "replayed"
  | "failed";

export type CoachAITelemetryRecord = {
  requestId: string;
  /** The opaque digest of ids and revisions. It contains no user content. */
  idempotencyKey: string | null;
  environment: CoachAIEnvironment | null;
  operation: CoachAIOperation | null;
  adapterKind: "fixture" | "provider";
  providerCode: string;
  modelCode: string;
  promptVersion: string | null;
  schemaVersion: string | null;
  startedAt: string;
  latencyMs: number;
  attemptCount: number;
  contextGoalCount: number | null;
  contextMemoryCount: number | null;
  contextBytes: number | null;
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
  estimatedCostMicroUsd: number | null;
  chargedCostMicroUsd: number | null;
  currency: "USD" | null;
  rateCardVersion: string | null;
  costReconciled: boolean | null;
  outcome: CoachAITelemetryOutcome;
  rejectionReason: CoachAIRejectionReason | null;
  errorCode: CoachAIErrorCode | null;
};

export interface CoachAITelemetrySink {
  record(record: CoachAITelemetryRecord): void;
}

/**
 * Copies field by field from the allowlist rather than spreading. A property
 * added to the caller's object — a raw body attached while debugging, say —
 * cannot ride along into the sink.
 */
export function toCoachAITelemetryRecord(
  record: CoachAITelemetryRecord,
): CoachAITelemetryRecord {
  const clean = {} as Record<string, unknown>;
  for (const field of COACH_AI_TELEMETRY_FIELDS) {
    clean[field] = record[field];
  }
  return clean as CoachAITelemetryRecord;
}

/**
 * The default sink: bounded, local, and injected rather than module-global, so
 * one request never observes another's buffer through shared module state.
 */
export class InMemoryCoachAITelemetrySink implements CoachAITelemetrySink {
  #records: CoachAITelemetryRecord[] = [];

  constructor(private readonly capacity: number = 100) {}

  record(record: CoachAITelemetryRecord): void {
    this.#records.push(toCoachAITelemetryRecord(record));
    if (this.#records.length > this.capacity) {
      this.#records.splice(0, this.#records.length - this.capacity);
    }
  }

  get records(): readonly CoachAITelemetryRecord[] {
    return this.#records;
  }
}
