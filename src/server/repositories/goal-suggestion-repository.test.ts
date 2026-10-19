import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  GoalSuggestionPersistenceError,
  GoalSuggestions,
} from "@/server/repositories/goal-suggestion-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";

/** ADR-035: what the coach's "don't repeat" list reads of goal suggestions. */
describe("GoalSuggestions.listForCoach", () => {
  it("reads the owner's open ones and those rejected since the date, newest decision first", async () => {
    const { client, query } = clientReturning([
      {
        title: "Run 5 km",
        status: "proposed",
        created_at: "2026-10-01T00:00:00Z",
        decided_at: null,
      },
      {
        title: "Swim a mile",
        status: "rejected",
        created_at: "2026-09-01T00:00:00Z",
        decided_at: "2026-09-02T00:00:00Z",
      },
    ]);

    const listed = await new GoalSuggestions(client).listForCoach("2026-08-20");

    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.or).toHaveBeenCalledWith(
      "status.eq.proposed,and(status.eq.rejected,decided_at.gte.2026-08-20)",
    );
    expect(query.order).toHaveBeenNthCalledWith(1, "decided_at", {
      ascending: false,
      nullsFirst: true,
    });
    expect(listed).toEqual([
      {
        title: "Run 5 km",
        status: "proposed",
        createdAt: "2026-10-01T00:00:00Z",
        decidedAt: null,
      },
      {
        title: "Swim a mile",
        status: "rejected",
        createdAt: "2026-09-01T00:00:00Z",
        decidedAt: "2026-09-02T00:00:00Z",
      },
    ]);
  });

  it("refuses anything but a date before it reaches the filter", async () => {
    const { client } = clientReturning([]);

    await expect(
      new GoalSuggestions(client).listForCoach(
        "2026-08-20),status.eq.accepted",
      ),
    ).rejects.toBeInstanceOf(GoalSuggestionPersistenceError);
    expect(client.from).not.toHaveBeenCalled();
  });
});

function clientReturning(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
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
