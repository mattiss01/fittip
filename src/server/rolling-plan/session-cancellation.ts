import {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/training/cancellation-reasons";

export {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/training/cancellation-reasons";

/**
 * Why a session was cancelled (owner, 29 Sep 2026): one of six quick picks, a
 * short note, or both. Stored only — no coach reads it; letting one would be
 * its own ADR-013 step. It lives beside the session rather than on it, so no
 * read of a session, and nothing a snapshot copies, carries it.
 */
export type SessionCancellation = {
  reason: CancellationReason | null;
  note: string | null;
};

export class SessionCancellationValidationError extends Error {
  constructor() {
    super("The cancellation reason is invalid.");
    this.name = "SessionCancellationValidationError";
  }
}

/**
 * A reason and a note as the owner submitted them: an empty pick or a blank
 * note is "none", anything outside the six or over the bound is refused.
 */
export function parseSessionCancellation(
  reason: unknown,
  note: unknown,
): SessionCancellation {
  const pickedReason =
    reason === undefined || reason === null || reason === ""
      ? null
      : typeof reason === "string" &&
          (CANCELLATION_REASONS as readonly string[]).includes(reason)
        ? (reason as CancellationReason)
        : invalid();
  const trimmed =
    note === undefined || note === null
      ? ""
      : typeof note === "string"
        ? note.trim()
        : invalid();
  if (trimmed.length > CANCELLATION_NOTE_MAX) invalid();
  return { reason: pickedReason, note: trimmed === "" ? null : trimmed };
}

function invalid(): never {
  throw new SessionCancellationValidationError();
}
