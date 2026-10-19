import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  CoachCancellations,
  type CoachCancellationSession,
} from "@/server/repositories/coach-cancellation-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CANCELLED_AT = "2026-10-19T07:00:00.123456+00:00";

/**
 * ADR-033: a session the coach's replacement stands in for is left off its
 * day only while that replacement still stands beside it, and only while the
 * record is about the session's current cancellation.
 */
describe("CoachCancellations", () => {
  const old = (
    overrides: Partial<CoachCancellationSession> = {},
  ): CoachCancellationSession => ({
    id: "old",
    localDate: "2026-10-20",
    title: "Long run",
    status: "cancelled",
    cancelledAt: "2026-10-19T07:00:00.123Z",
    ...overrides,
  });
  const replacement = (
    overrides: Partial<CoachCancellationSession> = {},
  ): CoachCancellationSession => ({
    id: "new",
    localDate: "2026-10-20",
    title: "Easy spin",
    status: "active",
    cancelledAt: null,
    ...overrides,
  });
  const record = [
    {
      session_id: "old",
      replaced_by_session_id: "new",
      cancelled_at: CANCELLED_AT,
    },
  ];

  it("hides a replaced session beside its active replacement, reading as the owner", async () => {
    const { client, query } = clientReturning(record);
    const hidden = await new CoachCancellations(client).listHiddenByReplacement(
      [old(), replacement()],
    );

    expect(hidden).toEqual(new Set(["old"]));
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it.each([
    [
      "the replacement was cancelled since",
      [old(), replacement({ status: "cancelled" })],
    ],
    [
      "the replacement moved to another day",
      [old(), replacement({ localDate: "2026-10-21" })],
    ],
    ["the replacement is not in the read", [old()]],
    [
      "the session was brought back and cancelled again by hand",
      [old({ cancelledAt: "2026-10-19T09:00:00.000Z" }), replacement()],
    ],
  ] as const)("shows it again when %s", async (_label, sessions) => {
    const { client } = clientReturning(record);

    await expect(
      new CoachCancellations(client).listHiddenByReplacement([...sessions]),
    ).resolves.toEqual(new Set());
  });

  it("reads nothing when nothing is cancelled", async () => {
    const { client } = clientReturning(record);

    await expect(
      new CoachCancellations(client).listHiddenByReplacement([replacement()]),
    ).resolves.toEqual(new Set());
    expect(client.from).not.toHaveBeenCalled();
  });
});

function clientReturning(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const client = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: { sub: USER_ID },
          header: {},
          signature: new Uint8Array(),
        },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient<Database>;
  return { client, query };
}
