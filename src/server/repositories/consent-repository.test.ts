import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { COACH_NOTICE_VERSION } from "@/lib/coach-notice";
import { TERMS_VERSION } from "@/lib/legal";
import type { Database } from "@/lib/supabase/database.types";
import { CoachAIError } from "@/server/ai/errors";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import {
  ConsentAuthenticationError,
  ConsentPersistenceError,
  Consents,
} from "@/server/repositories/consent-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DECIDED_AT = "2026-11-15T09:00:00+00:00";

/**
 * B2 (ADR-043 decision 5): per kind, the latest decision is in force, and one
 * made against an older text is none. The coach gate follows the coach
 * decision alone.
 */
describe("Consents", () => {
  it("reads the latest decision of one kind, as the owner", async () => {
    const { client, query } = clientWith({
      decision: "agreed",
      version: TERMS_VERSION,
      decided_at: DECIDED_AT,
    });
    await expect(new Consents(client).current("terms")).resolves.toEqual({
      status: "agreed",
      decidedAt: DECIDED_AT,
    });
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("kind", "terms");
  });

  it("counts no decision, and one against an older text, as undecided", async () => {
    await expect(
      new Consents(clientWith(null).client).current("coach"),
    ).resolves.toEqual({ status: "undecided" });
    await expect(
      new Consents(
        clientWith({
          decision: "agreed",
          version: "2026-01-01",
          decided_at: DECIDED_AT,
        }).client,
      ).current("coach"),
    ).resolves.toEqual({ status: "undecided" });
  });

  it("records a decision against today's text, as the owner", async () => {
    const { client, insert } = clientWith(null);
    await new Consents(client).record("coach", "declined");
    expect(insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      kind: "coach",
      decision: "declined",
      version: COACH_NOTICE_VERSION,
    });
  });

  it("never records the terms as declined", async () => {
    const { client, insert } = clientWith(null);
    await expect(
      new Consents(client).record("terms", "declined"),
    ).rejects.toBeInstanceOf(ConsentPersistenceError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a caller with no verified user", async () => {
    const { client } = clientWith(null, { signedIn: false });
    await expect(new Consents(client).current("terms")).rejects.toBeInstanceOf(
      ConsentAuthenticationError,
    );
  });
});

describe("verifyCoachAIOwner", () => {
  it("names the owner once the coach is agreed to", async () => {
    const { client } = clientWith({
      decision: "agreed",
      version: COACH_NOTICE_VERSION,
      decided_at: DECIDED_AT,
    });
    await expect(verifyCoachAIOwner(client)).resolves.toEqual({
      id: USER_ID,
    });
  });

  it.each([
    ["no decision", null],
    [
      "a decline",
      {
        decision: "declined",
        version: COACH_NOTICE_VERSION,
        decided_at: DECIDED_AT,
      },
    ],
    [
      "an agreement to an older notice",
      { decision: "agreed", version: "2026-01-01", decided_at: DECIDED_AT },
    ],
  ])("refuses the coach after %s", async (_case, row) => {
    const { client } = clientWith(row);
    await expect(verifyCoachAIOwner(client)).rejects.toEqual(
      new CoachAIError("consent_required"),
    );
  });

  it("refuses the coach when the decision cannot be read", async () => {
    const { client } = clientWith(null, { readError: true });
    await expect(verifyCoachAIOwner(client)).rejects.toEqual(
      new CoachAIError("consent_required"),
    );
  });

  it("still refuses a caller with no verified user as before", async () => {
    const { client } = clientWith(null, { signedIn: false });
    await expect(verifyCoachAIOwner(client)).rejects.toEqual(
      new CoachAIError("owner_denied"),
    );
  });
});

function clientWith(row: unknown, { signedIn = true, readError = false } = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue(
        readError
          ? { data: null, error: { code: "XX000" } }
          : { data: row, error: null },
      ),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  const insert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getClaims: vi.fn().mockResolvedValue(
        signedIn
          ? {
              data: {
                claims: { sub: USER_ID },
                header: {},
                signature: new Uint8Array(),
              },
              error: null,
            }
          : { data: null, error: new Error("no session") },
      ),
    },
    from: vi.fn().mockReturnValue({ ...query, insert }),
  } as unknown as SupabaseClient<Database>;
  return { client, query, insert };
}
