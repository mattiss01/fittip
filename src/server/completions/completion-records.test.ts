import { describe, expect, it } from "vitest";

import {
  CompletionValidationError,
  parseCompletionInput,
} from "@/server/completions/completion-records";

const PLANNED_ID = "00000000-0000-4000-8000-000000000010";
const GROUP_ID = "00000000-0000-4000-8000-000000000020";
const IDEMPOTENCY_ID = "00000000-0000-4000-8000-000000000030";

describe("completion domain validation", () => {
  it.each(["completed", "partially_completed", "skipped", "rest"] as const)(
    "accepts the %s planned outcome",
    (status) => {
      expect(parseCompletionInput(completion({ status }))).toMatchObject({
        status,
        plannedSessionId: PLANNED_ID,
        expectedRevision: 0,
      });
    },
  );

  it("requires a description for replacement and preserves the plan reference", () => {
    expect(
      parseCompletionInput(
        completion({
          status: "replaced",
          replacementDescription: "Indoor bike instead of the icy run",
        }),
      ),
    ).toMatchObject({
      status: "replaced",
      plannedSessionId: PLANNED_ID,
      replacementDescription: "Indoor bike instead of the icy run",
    });

    expect(() =>
      parseCompletionInput(completion({ status: "replaced" })),
    ).toThrow(CompletionValidationError);
  });

  it("requires no planned id for an unplanned completion", () => {
    const value = completion({
      status: "unplanned",
      plannedSessionId: undefined,
    });
    expect(parseCompletionInput(value)).toMatchObject({
      status: "unplanned",
      plannedSessionId: undefined,
    });
    expect(() =>
      parseCompletionInput(
        completion({ status: "unplanned", plannedSessionId: PLANNED_ID }),
      ),
    ).toThrow(CompletionValidationError);
  });

  it("enforces effort, duration, feeling, notes and measurements", () => {
    expect(() =>
      parseCompletionInput(completion({ perceivedEffort: 11 })),
    ).toThrow(CompletionValidationError);
    expect(() =>
      parseCompletionInput(completion({ durationMinutes: -1 })),
    ).toThrow(CompletionValidationError);
    expect(() => parseCompletionInput(completion({ feeling: "good" }))).toThrow(
      CompletionValidationError,
    );
    expect(() =>
      parseCompletionInput(completion({ note: "x".repeat(2001) })),
    ).toThrow(CompletionValidationError);
    expect(() =>
      parseCompletionInput(
        completion({
          activities: [
            {
              position: 0,
              name: "Intervals",
              sport: "Running",
              measurementMode: "time_distance_pace",
              actualMeasurement: { distance: 5 },
            },
          ],
        }),
      ),
    ).toThrow(CompletionValidationError);
  });

  it("requires append-only correction coordinates and a reason", () => {
    expect(
      parseCompletionInput(
        completion({
          completionGroupId: GROUP_ID,
          expectedRevision: 1,
          correctionReason: "Corrected the duration from my watch.",
        }),
      ),
    ).toMatchObject({
      completionGroupId: GROUP_ID,
      expectedRevision: 1,
      correctionReason: "Corrected the duration from my watch.",
    });

    expect(() =>
      parseCompletionInput(
        completion({ completionGroupId: GROUP_ID, expectedRevision: 1 }),
      ),
    ).toThrow(CompletionValidationError);
  });

  it("rejects unknown caller-owned identity fields", () => {
    expect(() =>
      parseCompletionInput({ ...completion(), userId: PLANNED_ID }),
    ).toThrow(CompletionValidationError);
  });
});

function completion(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: IDEMPOTENCY_ID,
    expectedRevision: 0,
    plannedSessionId: PLANNED_ID,
    actualLocalDate: "2026-07-28",
    timezoneName: "Europe/Berlin",
    status: "completed",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    activities: [],
    ...overrides,
  };
}
