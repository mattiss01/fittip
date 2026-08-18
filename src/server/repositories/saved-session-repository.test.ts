import { describe, expect, it, vi } from "vitest";

import {
  PostgresSavedSessionAdapter,
  SavedSessionAuthenticationError,
} from "./saved-session-repository";
import {
  SavedSessionConflictError,
  SavedSessionLibrary,
  SavedSessionPersistenceError,
  SavedSessionValidationError,
} from "@/server/saved-sessions/saved-sessions";

const USER_ID = "76000000-0000-4000-8000-000000000001";
const SAVED_ID = "76000000-0000-4000-8000-000000000002";

describe("PostgresSavedSessionAdapter", () => {
  it("derives the owner, supplies no owner to the RPC, and disables retries", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: { saved_session_id: SAVED_ID, revision: 0, result: "created" },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const library = new SavedSessionLibrary(
      new PostgresSavedSessionAdapter(client({ rpc })),
    );

    await library.applyChange({
      operation: "create",
      session: {
        name: "Tuesday tempo",
        title: "Tempo run",
        sport: "Running",
        activities: [],
      },
    });

    expect(rpc).toHaveBeenCalledWith("apply_saved_session_change", {
      p_operation: "create",
      p_name: "Tuesday tempo",
      p_title: "Tempo run",
      p_sport: "Running",
      p_intent: undefined,
      p_expected_duration_minutes: undefined,
      p_note: undefined,
      p_activities: [],
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_saved_session_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_expected_revision");
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("sends the revision back on an edit and carries no activity list", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: { saved_session_id: SAVED_ID, revision: 4, result: "updated" },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const library = new SavedSessionLibrary(
      new PostgresSavedSessionAdapter(client({ rpc })),
    );

    await library.applyChange({
      operation: "edit",
      savedSessionId: SAVED_ID,
      expectedRevision: 3,
      session: { name: "Renamed", title: "Tempo run", sport: "Running" },
    });

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_operation: "edit",
      p_saved_session_id: SAVED_ID,
      p_expected_revision: 3,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_activities");
  });

  it.each([
    ["PT409", SavedSessionConflictError],
    ["22023", SavedSessionValidationError],
    ["23514", SavedSessionPersistenceError],
  ])(
    "maps %s without forwarding private database text",
    async (code, ErrorType) => {
      const adapter = new PostgresSavedSessionAdapter(
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
        operation: "delete" as const,
        savedSessionId: SAVED_ID,
        expectedRevision: 0,
      };
      await expect(adapter.applyChange(change)).rejects.toThrow(ErrorType);
      await expect(adapter.applyChange(change)).rejects.not.toThrow(
        /Knee pain/,
      );
    },
  );

  it("reads the owner's own rows and returns activities in position order", async () => {
    const order = vi.fn();
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order,
    };
    order.mockReturnValueOnce(builder).mockReturnValueOnce({
      data: [
        {
          id: SAVED_ID,
          name: "Tuesday tempo",
          title: "Tempo run",
          sport: "Running",
          intent: null,
          expected_duration_minutes: 60,
          note: null,
          revision: 2,
          updated_at: "2026-08-18T10:00:00.000Z",
          saved_session_activities: [
            {
              personal_activity_id: null,
              position: 1,
              name: "Cool down",
              sport: "Running",
              instructions: null,
              measurement_mode: "duration_intensity",
              target: null,
            },
            {
              personal_activity_id: null,
              position: 0,
              name: "Tempo blocks",
              sport: "Running",
              instructions: "3 x 8 minutes",
              measurement_mode: "custom",
              target: null,
            },
          ],
        },
      ],
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);
    const library = new SavedSessionLibrary(
      new PostgresSavedSessionAdapter(client({ from })),
    );

    const sessions = await library.list();
    expect(from).toHaveBeenCalledWith("saved_sessions");
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessions).toEqual([
      {
        id: SAVED_ID,
        name: "Tuesday tempo",
        title: "Tempo run",
        sport: "Running",
        expectedDurationMinutes: 60,
        revision: 2,
        updatedAt: "2026-08-18T10:00:00.000Z",
        activities: [
          {
            position: 0,
            name: "Tempo blocks",
            sport: "Running",
            instructions: "3 x 8 minutes",
            measurementMode: "custom",
          },
          {
            position: 1,
            name: "Cool down",
            sport: "Running",
            measurementMode: "duration_intensity",
          },
        ],
      },
    ]);
  });

  it("refuses a row whose measurement mode is not one this system knows", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: SAVED_ID,
          name: "Tuesday tempo",
          title: "Tempo run",
          sport: "Running",
          intent: null,
          expected_duration_minutes: null,
          note: null,
          revision: 0,
          updated_at: "2026-08-18T10:00:00.000Z",
          saved_session_activities: [
            {
              personal_activity_id: null,
              position: 0,
              name: "Invented",
              sport: "Running",
              instructions: null,
              measurement_mode: "invented_mode",
              target: null,
            },
          ],
        },
        error: null,
      }),
    };
    const library = new SavedSessionLibrary(
      new PostgresSavedSessionAdapter(
        client({ from: vi.fn().mockReturnValue(builder) }),
      ),
    );
    await expect(library.get(SAVED_ID)).rejects.toThrow(
      SavedSessionPersistenceError,
    );
  });

  it("does not call persistence for an anonymous session", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const adapter = new PostgresSavedSessionAdapter(
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
    await expect(adapter.list()).rejects.toThrow(
      SavedSessionAuthenticationError,
    );
    await expect(
      adapter.applyChange({
        operation: "delete",
        savedSessionId: SAVED_ID,
        expectedRevision: 0,
      }),
    ).rejects.toThrow(SavedSessionAuthenticationError);
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
