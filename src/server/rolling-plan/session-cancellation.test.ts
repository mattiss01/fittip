import { describe, expect, it } from "vitest";

import {
  parseSessionCancellation,
  SessionCancellationValidationError,
} from "./session-cancellation";
import { parseChangeSet, RollingPlanValidationError } from "./rolling-plan";

const SESSION_ID = "7f000000-0000-4000-8000-000000000001";

describe("parseSessionCancellation", () => {
  it("reads an empty pick and a blank note as saying nothing", () => {
    expect(parseSessionCancellation("", "   ")).toEqual({
      reason: null,
      note: null,
    });
    expect(parseSessionCancellation(null, undefined)).toEqual({
      reason: null,
      note: null,
    });
  });

  it("keeps one of the six picks and a trimmed note", () => {
    expect(parseSessionCancellation("pain_or_injury", " left knee ")).toEqual({
      reason: "pain_or_injury",
      note: "left knee",
    });
  });

  it("refuses a pick outside the six and a note over the bound", () => {
    expect(() => parseSessionCancellation("bored", null)).toThrow(
      SessionCancellationValidationError,
    );
    expect(() => parseSessionCancellation(null, "x".repeat(501))).toThrow(
      SessionCancellationValidationError,
    );
    expect(() => parseSessionCancellation(null, 42)).toThrow(
      SessionCancellationValidationError,
    );
  });
});

describe("a cancel change", () => {
  const changeSet = (change: Record<string, unknown>) => ({
    idempotencyKey: "7f000000-0000-4000-8000-0000000000e1",
    provenance: "owner_manual",
    changes: [change],
  });

  it("may carry a reason and a note, and omits what was not given", () => {
    expect(
      parseChangeSet(
        changeSet({
          operation: "cancel",
          sessionId: SESSION_ID,
          reason: "weather",
        }),
      ).changes,
    ).toEqual([
      { operation: "cancel", sessionId: SESSION_ID, reason: "weather" },
    ]);
  });

  it("refuses a reason outside the six and any key it does not know", () => {
    expect(() =>
      parseChangeSet(
        changeSet({
          operation: "cancel",
          sessionId: SESSION_ID,
          reason: "bored",
        }),
      ),
    ).toThrow(RollingPlanValidationError);
    expect(() =>
      parseChangeSet(
        changeSet({ operation: "cancel", sessionId: SESSION_ID, why: "tired" }),
      ),
    ).toThrow(RollingPlanValidationError);
  });
});
