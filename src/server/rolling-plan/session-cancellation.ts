import { CANCELLATION_REASON_MAX } from "@/lib/training/cancellation-reasons";

export { CANCELLATION_REASON_MAX } from "@/lib/training/cancellation-reasons";

/**
 * Why a session was cancelled (owner, 29 Sep 2026), in the owner's own words.
 * Stored only — no coach reads it; letting one would be its own ADR-013 step.
 * It lives beside the session rather than on it, so no read of a session, and
 * nothing a snapshot copies, carries it.
 */
export type SessionCancellation = { reason: string };

export class SessionCancellationValidationError extends Error {
  constructor() {
    super("The cancellation reason is invalid.");
    this.name = "SessionCancellationValidationError";
  }
}

/**
 * A reason as the owner submitted it: blank is "none" and reads as null;
 * anything longer than the bound, or not text at all, is refused.
 */
export function parseCancellationReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new SessionCancellationValidationError();
  const trimmed = value.trim();
  if (trimmed.length > CANCELLATION_REASON_MAX)
    throw new SessionCancellationValidationError();
  return trimmed === "" ? null : trimmed;
}
