import { describe, expect, it } from "vitest";

import { isoDateInTimezone } from "@/lib/date/local-date";

import {
  CompletionLog,
  CompletionValidationError,
  type CompletionPlannedSnapshot,
} from "./completion-log";
import {
  CONTRACT_PLANNED_SESSION,
  registerCompletionLogContract,
} from "./completion-log-contract";
import { InMemoryCompletionLogAdapter } from "./in-memory-completion-log-adapter";

const CONTRACT_TIMEZONE = "Europe/Berlin";
const CONTRACT_NOW = new Date("2026-08-17T09:30:00.000Z");

registerCompletionLogContract("the in-memory adapter", async () => {
  const adapter = new InMemoryCompletionLogAdapter({
    timezoneName: CONTRACT_TIMEZONE,
    clock: () => CONTRACT_NOW,
  });
  return {
    completions: new CompletionLog(adapter),
    today: isoDateInTimezone(CONTRACT_NOW, CONTRACT_TIMEZONE),
    addPlanSession: async (localDate, title) =>
      adapter.addPlanSession(plannedSession(localDate, title)),
    editPlanSession: async (sessionId, title) =>
      adapter.editPlanSession(sessionId, title),
    clearTimezone: async () => adapter.clearTimezone(),
  };
});

function plannedSession(
  localDate: string,
  title: string,
): CompletionPlannedSnapshot {
  return {
    ...CONTRACT_PLANNED_SESSION,
    localDate,
    title,
    status: "active",
    seriesId: null,
    occurrenceDate: null,
  };
}

describe("completion log interface validation", () => {
  const log = () =>
    new CompletionLog(
      new InMemoryCompletionLogAdapter({ timezoneName: CONTRACT_TIMEZONE }),
    );

  it("requires a bounded valid window and rejects unknown input keys", async () => {
    await expect(log().list("2026-08-20", "2026-08-19")).rejects.toThrow(
      CompletionValidationError,
    );
    await expect(
      log().applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: "2026-08-20",
          activities: [],
          userId: "75000000-0000-4000-8000-000000000001",
        },
      }),
    ).rejects.toThrow(CompletionValidationError);
  });

  it("refuses a replacement description on any other outcome", async () => {
    await expect(
      log().applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: "2026-08-20",
          replacementDescription: "Swam instead",
          activities: [],
        },
      }),
    ).rejects.toThrow(CompletionValidationError);
  });

  it("keeps every recorded number inside the scale it declares", async () => {
    for (const completion of [
      { perceivedEffort: 11 },
      { perceivedEffort: 0 },
      { durationMinutes: -1 },
      { durationMinutes: 10081 },
      { feeling: "fine" },
    ]) {
      await expect(
        log().applyChange({
          operation: "create",
          completion: {
            status: "unplanned",
            actualLocalDate: "2026-08-20",
            activities: [],
            ...completion,
          },
        }),
      ).rejects.toThrow(CompletionValidationError);
    }
  });

  it("refuses two activities claiming one position", async () => {
    await expect(
      log().applyChange({
        operation: "create",
        completion: {
          status: "unplanned",
          actualLocalDate: "2026-08-20",
          activities: [
            {
              position: 0,
              name: "First",
              sport: "Running",
              measurementMode: "custom",
            },
            {
              position: 0,
              name: "Second",
              sport: "Running",
              measurementMode: "custom",
            },
          ],
        },
      }),
    ).rejects.toThrow(CompletionValidationError);
  });

  it("normalizes an instant so two adapters cannot spell it differently", async () => {
    const adapter = new InMemoryCompletionLogAdapter({
      timezoneName: CONTRACT_TIMEZONE,
    });
    const completions = new CompletionLog(adapter);
    const { completionId } = await completions.applyChange({
      operation: "create",
      completion: {
        status: "unplanned",
        actualLocalDate: "2026-08-20",
        actualStartedAt: "2026-08-20T06:30:00+02:00",
        activities: [],
      },
    });

    expect((await completions.get(completionId))?.actualStartedAt).toBe(
      "2026-08-20T04:30:00.000Z",
    );
  });
});
