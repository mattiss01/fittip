import { describe, expect, it } from "vitest";

import {
  normalizeOwnerText,
  OwnerTextValidationError,
  parsePlanningNote,
  parseRegenerationFeedback,
  PLANNING_NOTE_MAX_LENGTH,
  REGENERATION_FEEDBACK_MAX_LENGTH,
} from "@/server/ai/owner-text";

describe("owner text normalization", () => {
  it("collapses CR and CRLF to LF", () => {
    expect(normalizeOwnerText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("normalizes to NFC", () => {
    // A decomposed umlaut and a composed one must produce the same string, or a
    // memory candidate quoting one would not match a note holding the other.
    const decomposed = "Grüße";
    const composed = "Grüße";

    expect(normalizeOwnerText(decomposed)).toBe(composed);
    expect(normalizeOwnerText(decomposed)).toBe(normalizeOwnerText(composed));
  });

  it("trims ASCII whitespace from both ends and nowhere else", () => {
    expect(normalizeOwnerText("  \t hello  world \n ")).toBe("hello  world");
  });

  it("is idempotent", () => {
    const value = "  I am away\r\non the first weekend.  ";
    expect(normalizeOwnerText(normalizeOwnerText(value))).toBe(
      normalizeOwnerText(value),
    );
  });
});

describe("the planning note", () => {
  it("is optional, and an empty note is absent rather than empty", () => {
    // ADR-014 decision 1: a proposal with no note is an ordinary proposal, not
    // a degraded one.
    expect(parsePlanningNote(undefined)).toBeNull();
    expect(parsePlanningNote(null)).toBeNull();
    expect(parsePlanningNote("   \n  ")).toBeNull();
  });

  it("accepts a note at the approved maximum", () => {
    const note = "x".repeat(PLANNING_NOTE_MAX_LENGTH);
    expect(parsePlanningNote(note)).toHaveLength(PLANNING_NOTE_MAX_LENGTH);
  });

  it("rejects an over-length note rather than truncating it", () => {
    // Decision 3. Over-length is a rejection at compose where the owner can fix
    // it, deliberately unlike a completion note, where the owner is not present
    // and truncation is the only option that preserves the flow.
    expect(() =>
      parsePlanningNote("x".repeat(PLANNING_NOTE_MAX_LENGTH + 1)),
    ).toThrow(OwnerTextValidationError);
  });

  it("never echoes the submitted text in its error", () => {
    try {
      parsePlanningNote("secret constraint ".repeat(200));
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret");
      expect((error as OwnerTextValidationError).field).toBe("planning_note");
    }
  });

  it("counts characters, and leaves the byte reservation to the budget", () => {
    // ADR-014 decision 4 reserves 1,200 bytes for a 1,000-character field
    // precisely because this check is in characters: an umlaut is one character
    // and two bytes, and JSON escaping adds more.
    const german = "ü".repeat(PLANNING_NOTE_MAX_LENGTH);
    const parsed = parsePlanningNote(german);

    expect(parsed).toHaveLength(1000);
    expect(new TextEncoder().encode(parsed as string).length).toBe(2000);
  });
});

describe("regeneration feedback", () => {
  it("is absent on an initial request", () => {
    expect(parseRegenerationFeedback(undefined)).toBeNull();
    expect(parseRegenerationFeedback("")).toBeNull();
  });

  it("accepts feedback at the approved maximum and rejects beyond it", () => {
    expect(
      parseRegenerationFeedback("x".repeat(REGENERATION_FEEDBACK_MAX_LENGTH)),
    ).toHaveLength(REGENERATION_FEEDBACK_MAX_LENGTH);
    expect(() =>
      parseRegenerationFeedback(
        "x".repeat(REGENERATION_FEEDBACK_MAX_LENGTH + 1),
      ),
    ).toThrow(OwnerTextValidationError);
  });

  it("is capped well below the planning note", () => {
    // The two fields hold different kinds of statement. Feedback is a comment
    // on one rejected proposal; the note is a standing constraint. Merging them
    // is the failure the two-field split exists to prevent.
    expect(REGENERATION_FEEDBACK_MAX_LENGTH).toBeLessThan(
      PLANNING_NOTE_MAX_LENGTH,
    );
  });
});
