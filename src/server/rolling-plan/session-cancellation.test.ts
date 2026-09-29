import { describe, expect, it } from "vitest";

import {
  parseCancellationReason,
  SessionCancellationValidationError,
} from "./session-cancellation";
import { parseChangeSet, RollingPlanValidationError } from "./rolling-plan";

const SESSION_ID = "7f000000-0000-4000-8000-000000000001";

describe("parseCancellationReason", () => {
  it("reads nothing or blank as no reason", () => {
    expect(parseCancellationReason(undefined)).toBeNull();
    expect(parseCancellationReason(null)).toBeNull();
    expect(parseCancellationReason("   ")).toBeNull();
  });

  it("keeps the owner's words, trimmed", () => {
    expect(parseCancellationReason("  left knee sore ")).toBe("left knee sore");
  });

  it("refuses anything over the bound, or not text", () => {
    expect(() => parseCancellationReason("x".repeat(501))).toThrow(
      SessionCancellationValidationError,
    );
    expect(() => parseCancellationReason(42)).toThrow(
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

  it("may carry a reason, and omits a blank one", () => {
    expect(
      parseChangeSet(
        changeSet({
          operation: "cancel",
          sessionId: SESSION_ID,
          reason: " storm ",
        }),
      ).changes,
    ).toEqual([
      { operation: "cancel", sessionId: SESSION_ID, reason: "storm" },
    ]);
    expect(
      parseChangeSet(
        changeSet({ operation: "cancel", sessionId: SESSION_ID, reason: "" }),
      ).changes,
    ).toEqual([{ operation: "cancel", sessionId: SESSION_ID }]);
  });

  it("refuses an over-long reason and any key it does not know", () => {
    expect(() =>
      parseChangeSet(
        changeSet({
          operation: "cancel",
          sessionId: SESSION_ID,
          reason: "x".repeat(501),
        }),
      ),
    ).toThrow(RollingPlanValidationError);
    expect(() =>
      parseChangeSet(
        changeSet({
          operation: "cancel",
          sessionId: SESSION_ID,
          note: "tired",
        }),
      ),
    ).toThrow(RollingPlanValidationError);
  });
});
