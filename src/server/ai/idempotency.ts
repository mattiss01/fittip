import "server-only";

import type { CoachAIOperation } from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";

/**
 * Idempotency as injected in-memory policy.
 *
 * The derived key is a digest of owner, operation, schema version, and the two
 * collection revisions. It is deliberately **not** a hash of user content: a
 * content hash leaks by comparison — an attacker holding a candidate sentence
 * could confirm it by reproducing the key. Revisions carry the same "did the
 * input change" signal without that property.
 *
 * As with the budget, this state is per-instance and does not survive a Vercel
 * instance change. Durable hosted idempotency is M3-01B.
 */

export const COACH_AI_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const DEFAULT_CAPACITY = 200;

export type CoachAIIdempotencyInput = {
  ownerId: string;
  operation: CoachAIOperation;
  schemaVersion: string;
  goalCollectionRevision: number;
  memoryCollectionRevision: number;
  /**
   * Anything else that makes this a different question: the horizon, the
   * lengths of the two owner-text fields, and whether this is a regeneration.
   * Lengths rather than content, for the same reason revisions are used above.
   */
  requestShape?: string;
};

/**
 * Opaque, bounded, and stable for an unchanged owner/operation/schema/context.
 * A changed operation, schema, or collection revision produces a different
 * value, which is what makes a caller-supplied key detectable as a conflict.
 */
export function buildCoachAIIdempotencyKey(
  input: CoachAIIdempotencyInput,
): string {
  const material = [
    input.ownerId,
    input.operation,
    input.schemaVersion,
    String(input.goalCollectionRevision),
    String(input.memoryCollectionRevision),
    input.requestShape ?? "",
  ].join("|");

  return `ck_${digest(material, 0x811c9dc5)}${digest(material, 0x01000193)}`;
}

export function isCoachAIIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export type CoachAIIdempotencyOutcome<Result> =
  | {
      state: "fresh";
      complete: (result: Result) => void;
      fail: (error: unknown) => void;
    }
  | { state: "joined"; pending: Promise<Result> }
  | { state: "replayed"; result: Result };

export class CoachAIIdempotencyStore<Result> {
  #entries = new Map<
    string,
    { fingerprint: string; pending?: Promise<Result>; result?: Result }
  >();

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  /**
   * `fresh` is the only outcome that may proceed to a budget reservation and an
   * adapter call. A concurrent duplicate joins the single in-flight attempt, and
   * a completed identical request replays its already validated result, so
   * neither creates a second attempt or a second charge.
   */
  begin(key: string, fingerprint: string): CoachAIIdempotencyOutcome<Result> {
    if (!isCoachAIIdempotencyKey(key)) {
      throw new CoachAIError("invalid_input");
    }

    const existing = this.#entries.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        // Same key, different operation, schema, or context version.
        throw new CoachAIError("idempotency_conflict");
      }
      if (existing.result !== undefined) {
        return { state: "replayed", result: existing.result };
      }
      if (existing.pending) {
        return { state: "joined", pending: existing.pending };
      }
    }

    let settle: (result: Result) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const pending = new Promise<Result>((resolve, rejectPending) => {
      settle = resolve;
      reject = rejectPending;
    });
    // Nothing may join a failed attempt after the fact, so the shared promise
    // needs its own handler or a rejection becomes an unhandled one.
    pending.catch(() => {});

    this.#entries.set(key, { fingerprint, pending });
    this.#evictOverflow();

    return {
      state: "fresh",
      complete: (result) => {
        this.#entries.set(key, { fingerprint, result });
        settle(result);
      },
      fail: (error) => {
        // A failure is not cached: the owner may retry once the cause is gone.
        this.#entries.delete(key);
        reject(error);
      },
    };
  }

  #evictOverflow(): void {
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) return;
      this.#entries.delete(oldest.value);
    }
  }
}

/** FNV-1a. Chosen for a short stable id, never for a security property. */
function digest(value: string, offset: number): string {
  let hash = offset >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
