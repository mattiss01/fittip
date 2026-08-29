import { describe, expect, it, vi } from "vitest";

import {
  CompletionConflictError,
  CompletionLog,
  CompletionPersistenceError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
} from "@/server/completions/completion-log";

import {
  CompletionAuthenticationError,
  PostgresCompletionLogAdapter,
} from "./completion-log-repository";

const USER_ID = "77000000-0000-4000-8000-000000000001";
const COMPLETION_ID = "77000000-0000-4000-8000-000000000002";
const SESSION_ID = "77000000-0000-4000-8000-000000000003";

const PLANNED_SNAPSHOT = {
  localDate: "2026-08-20",
  position: 0,
  title: "Aerobic run",
  sport: "Running",
  intent: null,
  expectedDurationMinutes: 60,
  note: null,
  isLocked: false,
  status: "active",
  cancelledAt: null,
  seriesId: null,
  occurrenceDate: null,
  hasDiverged: false,
  activities: [
    {
      id: "77000000-0000-4000-8000-0000000000a1",
      personalActivityId: null,
      position: 0,
      name: "Easy running",
      sport: "Running",
      instructions: null,
      measurementMode: "duration_intensity",
      target: { duration_minutes: 40, intensity: "easy" },
      isLocked: false,
    },
  ],
};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPLETION_ID,
    plan_session_id: SESSION_ID,
    status: "completed",
    actual_local_date: "2026-08-20",
    timezone_name: "Europe/Berlin",
    actual_started_at: "2026-08-20T06:30:00+00:00",
    duration_minutes: 58,
    perceived_effort: 6,
    feeling: "good",
    note: null,
    replacement_description: null,
    pain_reported: false,
    illness_reported: false,
    injury_reported: false,
    severe_fatigue_reported: false,
    planned_snapshot: PLANNED_SNAPSHOT,
    revision: 1,
    updated_at: "2026-08-20T07:00:00.000Z",
    completed_activities: [],
    ...overrides,
  };
}

describe("PostgresCompletionLogAdapter", () => {
  it("derives the owner, sends no owner or snapshot, and disables retries", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: { completion_id: COMPLETION_ID, revision: 0, result: "created" },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const completions = new CompletionLog(
      new PostgresCompletionLogAdapter(client({ rpc })),
    );

    await completions.applyChange({
      operation: "create",
      completion: {
        planSessionId: SESSION_ID,
        status: "completed",
        actualLocalDate: "2026-08-20",
        activities: [],
      },
    });

    expect(rpc).toHaveBeenCalledWith("apply_completion_change", {
      p_operation: "create",
      p_completion: {
        planSessionId: SESSION_ID,
        status: "completed",
        actualLocalDate: "2026-08-20",
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        activities: [],
      },
    });
    const [, args] = rpc.mock.calls[0];
    expect(args).not.toHaveProperty("p_completion_id");
    expect(args).not.toHaveProperty("p_expected_revision");
    expect(args.p_completion).not.toHaveProperty("plannedSnapshot");
    expect(args.p_completion).not.toHaveProperty("timezoneName");
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("sends the revision back on an edit and carries no activity list", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: { completion_id: COMPLETION_ID, revision: 4, result: "updated" },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const completions = new CompletionLog(
      new PostgresCompletionLogAdapter(client({ rpc })),
    );

    await completions.applyChange({
      operation: "edit",
      completionId: COMPLETION_ID,
      expectedRevision: 3,
      completion: { status: "skipped", actualLocalDate: "2026-08-20" },
    });

    const [, args] = rpc.mock.calls[0];
    expect(args).toMatchObject({
      p_operation: "edit",
      p_completion_id: COMPLETION_ID,
      p_expected_revision: 3,
    });
    expect(args.p_completion).not.toHaveProperty("activities");
    expect(args.p_completion).not.toHaveProperty("planSessionId");
  });

  it.each([
    ["PT409", CompletionConflictError],
    ["PT428", CompletionTimezoneRequiredError],
    ["22023", CompletionValidationError],
    ["23514", CompletionPersistenceError],
  ])(
    "maps %s without forwarding private database text",
    async (code, ErrorType) => {
      const adapter = new PostgresCompletionLogAdapter(
        client({
          rpc: vi.fn().mockReturnValue({
            retry: vi.fn().mockResolvedValue({
              data: null,
              error: { code, message: "Knee pain supplied in a row" },
            }),
          }),
        }),
      );
      const change = {
        operation: "edit" as const,
        completionId: COMPLETION_ID,
        expectedRevision: 0,
        completion: {
          status: "skipped" as const,
          actualLocalDate: "2026-08-20",
          painReported: false,
          illnessReported: false,
          injuryReported: false,
          severeFatigueReported: false,
        },
      };
      await expect(adapter.applyChange(change)).rejects.toThrow(ErrorType);
      await expect(adapter.applyChange(change)).rejects.not.toThrow(
        /Knee pain/,
      );
    },
  );

  it("reads the owner's own window and projects the planned snapshot", async () => {
    const order = vi.fn();
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order,
    };
    order
      .mockReturnValueOnce(builder)
      .mockReturnValueOnce({ data: [storedRow()], error: null });
    const from = vi.fn().mockReturnValue(builder);
    const completions = new CompletionLog(
      new PostgresCompletionLogAdapter(client({ from })),
    );

    const history = await completions.list("2026-08-01", "2026-08-31");

    expect(from).toHaveBeenCalledWith("completions");
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.gte).toHaveBeenCalledWith("actual_local_date", "2026-08-01");
    expect(builder.lte).toHaveBeenCalledWith("actual_local_date", "2026-08-31");
    expect(history).toEqual([
      {
        id: COMPLETION_ID,
        planSessionId: SESSION_ID,
        status: "completed",
        actualLocalDate: "2026-08-20",
        timezoneName: "Europe/Berlin",
        actualStartedAt: "2026-08-20T06:30:00.000Z",
        durationMinutes: 58,
        perceivedEffort: 6,
        feeling: "good",
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        revision: 1,
        updatedAt: "2026-08-20T07:00:00.000Z",
        activities: [],
        plannedSnapshot: {
          localDate: "2026-08-20",
          position: 0,
          title: "Aerobic run",
          sport: "Running",
          expectedDurationMinutes: 60,
          isLocked: false,
          status: "active",
          seriesId: null,
          occurrenceDate: null,
          activities: [
            {
              position: 0,
              name: "Easy running",
              sport: "Running",
              measurementMode: "duration_intensity",
              target: { duration_minutes: 40, intensity: "easy" },
            },
          ],
        },
      },
    ]);
  });

  it("refuses a row whose link and snapshot disagree", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: storedRow({ plan_session_id: null }),
        error: null,
      }),
    };
    const completions = new CompletionLog(
      new PostgresCompletionLogAdapter(
        client({ from: vi.fn().mockReturnValue(builder) }),
      ),
    );

    await expect(completions.get(COMPLETION_ID)).rejects.toThrow(
      CompletionPersistenceError,
    );
  });

  it("refuses a row whose measurement mode is not one this system knows", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: storedRow({
          completed_activities: [
            {
              personal_activity_id: null,
              position: 0,
              name: "Invented",
              sport: "Running",
              instructions: null,
              measurement_mode: "invented_mode",
              actual_measurement: null,
            },
          ],
        }),
        error: null,
      }),
    };
    const completions = new CompletionLog(
      new PostgresCompletionLogAdapter(
        client({ from: vi.fn().mockReturnValue(builder) }),
      ),
    );

    await expect(completions.get(COMPLETION_ID)).rejects.toThrow(
      CompletionPersistenceError,
    );
  });

  it("does not call persistence for an anonymous session", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const adapter = new PostgresCompletionLogAdapter(
      client({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: null },
            error: new Error("none"),
          }),
        },
        rpc,
        from,
      }),
    );

    await expect(
      adapter.list({ startDate: "2026-08-01", endDate: "2026-08-31" }),
    ).rejects.toThrow(CompletionAuthenticationError);
    await expect(adapter.get(COMPLETION_ID)).rejects.toThrow(
      CompletionAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

function client(overrides: Record<string, unknown>) {
  return {
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null }),
    },
    ...overrides,
  } as never;
}
