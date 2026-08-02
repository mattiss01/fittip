import { describe, expect, it } from "vitest";

import {
  isReviewDue,
  MEMORY_CONTENT_MAX_LENGTH,
  MemoryValidationError,
  parseExpectedRevision,
  parseMemoryContent,
  parseMemoryId,
  parseMemoryType,
  parseOptionalReviewDate,
  selectActiveMemoryContext,
  utcIsoDate,
  type MemoryItemView,
  type MemoryStatus,
} from "./memory-records";

const TODAY = "2026-08-01";

describe("memory content validation", () => {
  it("trims and accepts content inside the approved bounds", () => {
    expect(parseMemoryContent("  Trains before work.  ")).toBe(
      "Trains before work.",
    );
    expect(
      parseMemoryContent("a".repeat(MEMORY_CONTENT_MAX_LENGTH)),
    ).toHaveLength(MEMORY_CONTENT_MAX_LENGTH);
  });

  it.each([
    ["   "],
    [""],
    [null],
    [42],
    [{ content: "Trains before work." }],
    ["a".repeat(MEMORY_CONTENT_MAX_LENGTH + 1)],
  ])("rejects unusable content %s", (value) => {
    expect(() => parseMemoryContent(value)).toThrow(MemoryValidationError);
  });

  it("never repeats the submitted text in the validation message", () => {
    try {
      parseMemoryContent("a".repeat(MEMORY_CONTENT_MAX_LENGTH + 1));
      throw new Error("expected a validation error");
    } catch (error) {
      expect((error as Error).message).toBe("The memory details are invalid.");
    }
  });

  it("accepts only the four approved memory classes", () => {
    expect(parseMemoryType("observed_pattern")).toBe("observed_pattern");
    expect(() => parseMemoryType("equipment_catalog")).toThrow(
      MemoryValidationError,
    );
    expect(() => parseMemoryType("")).toThrow(MemoryValidationError);
  });

  it("accepts only a well-formed item id", () => {
    expect(parseMemoryId("53000000-0000-4000-8000-0000000000b1")).toBe(
      "53000000-0000-4000-8000-0000000000b1",
    );
    expect(() => parseMemoryId("53000000")).toThrow(MemoryValidationError);
    expect(() => parseMemoryId(null)).toThrow(MemoryValidationError);
  });

  it("accepts only a non-negative expected revision", () => {
    expect(parseExpectedRevision("3")).toBe(3);
    expect(parseExpectedRevision(0)).toBe(0);
    expect(() => parseExpectedRevision(-1)).toThrow(MemoryValidationError);
    expect(() => parseExpectedRevision("later")).toThrow(MemoryValidationError);
  });

  it("treats a blank review date as no review date", () => {
    expect(parseOptionalReviewDate("")).toBeUndefined();
    expect(parseOptionalReviewDate(null)).toBeUndefined();
    expect(parseOptionalReviewDate("2026-12-31")).toBe("2026-12-31");
    expect(() => parseOptionalReviewDate("31/12/2026")).toThrow(
      MemoryValidationError,
    );
    expect(() => parseOptionalReviewDate("2026-13-01")).toThrow(
      MemoryValidationError,
    );
  });

  it("reports the owner date used to decide review-due", () => {
    expect(utcIsoDate(new Date("2026-08-01T23:30:00.000Z"))).toBe("2026-08-01");
  });
});

describe("active memory context", () => {
  it.each<[MemoryStatus, boolean]>([
    ["active", true],
    ["proposed", false],
    ["rejected", false],
    ["archived", false],
  ])("includes %s memory: %s", (status, included) => {
    const context = selectActiveMemoryContext([item({ status })], TODAY);
    expect(context).toHaveLength(included ? 1 : 0);
  });

  it("excludes an active item whose review date has passed", () => {
    const expired = item({ id: "expired", expiresOn: "2026-07-31" });
    const current = item({ id: "current", expiresOn: "2026-08-01" });
    const undated = item({ id: "undated" });

    expect(
      selectActiveMemoryContext([expired, current, undated], TODAY).map(
        (entry) => entry.id,
      ),
    ).toEqual(["current", "undated"]);
  });

  it("marks a passed review date as review-due without changing the record", () => {
    const expired = item({ expiresOn: "2026-07-31" });
    expect(isReviewDue(expired, TODAY)).toBe(true);
    expect(expired.status).toBe("active");
    expect(expired.content).toBe("Trains before work.");
  });

  it("never reports a proposal as review-due", () => {
    expect(
      isReviewDue(item({ status: "proposed", expiresOn: "2020-01-01" }), TODAY),
    ).toBe(false);
  });
});

function item(overrides: Partial<MemoryItemView> = {}): MemoryItemView {
  return {
    id: "53000000-0000-4000-8000-0000000000b1",
    memoryType: "profile_fact",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: null,
    content: "Trains before work.",
    revisionNumber: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    history: [],
    ...overrides,
  };
}
