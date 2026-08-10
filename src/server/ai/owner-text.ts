import "server-only";

/**
 * The two owner-authored text fields ADR-014 admits to the coaching boundary,
 * and the one normalization everything downstream depends on.
 *
 * Normalization matters more than it looks. A memory candidate must cite an
 * exact substring of the planning note, and that check runs twice — here,
 * before the candidate is offered, and again inside
 * `record_roadmap_memory_candidates` against the stored note. If the two
 * normalizations disagree by one collapsed newline, a candidate the
 * application accepted is rejected by the database for a reason no owner can
 * see. `public.roadmap_normalize_owner_text` in the M3-02 migration is the
 * other half of this pair and must change with it.
 *
 * The steps, in order: CRLF and CR collapse to LF, the result is NFC, and
 * ASCII whitespace is trimmed from both ends. Nothing else happens — ADR-014
 * decision 3 forbids summarization, classification, redaction, or rewriting
 * between the owner's text and the provider.
 */

/** ADR-014 decision 1: matches `MEMORY_CONTENT_MAX_LENGTH`, one mental model. */
export const PLANNING_NOTE_MAX_LENGTH = 1000;

/** ADR-014 decision 6: mandatory on a regeneration, empty on every round. */
export const REGENERATION_FEEDBACK_MAX_LENGTH = 500;

/** Decision 4b: a candidate cites at most this much of the note. */
export const MEMORY_EXCERPT_MAX_LENGTH = 200;

const ASCII_WHITESPACE_EDGES = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;

export function normalizeOwnerText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .replace(ASCII_WHITESPACE_EDGES, "");
}

export class OwnerTextValidationError extends Error {
  constructor(readonly field: "planning_note" | "regeneration_feedback") {
    // Never echoes the submitted text. Owner free text must not travel in an
    // error message any more than it travels in telemetry.
    super("That text is too long for this field.");
    this.name = "OwnerTextValidationError";
  }
}

/**
 * ADR-014 decision 3: over-length is a rejection at the compose step where the
 * owner can fix it, never a silent truncation. This differs deliberately from
 * ADR-013's treatment of a completion note, where the owner is not present.
 *
 * An empty or whitespace-only note is `null`, not `""`: the note is optional,
 * and a proposal with no note is an ordinary proposal rather than a degraded
 * one.
 */
export function parsePlanningNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new OwnerTextValidationError("planning_note");
  }
  const clean = normalizeOwnerText(value);
  if (clean.length === 0) return null;
  if (clean.length > PLANNING_NOTE_MAX_LENGTH) {
    throw new OwnerTextValidationError("planning_note");
  }
  return clean;
}

/**
 * Mandatory on a regeneration and absent otherwise. "This field is required
 * and starts empty" is trivially checkable, where "the note must differ from
 * its prefill" is weak and gameable — which is why ADR-014 decision 2a chose
 * the two-field shape over one box.
 */
export function parseRegenerationFeedback(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new OwnerTextValidationError("regeneration_feedback");
  }
  const clean = normalizeOwnerText(value);
  if (clean.length === 0) return null;
  if (clean.length > REGENERATION_FEEDBACK_MAX_LENGTH) {
    throw new OwnerTextValidationError("regeneration_feedback");
  }
  return clean;
}
