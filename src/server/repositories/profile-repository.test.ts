import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  InvalidUsernameError,
  normalizeUsername,
  ProfileAuthenticationError,
  ProfilePersistenceError,
  ProfileRepository,
  UsernameUnavailableError,
  validateUsername,
} from "@/server/repositories/profile-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("username boundary", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeUsername("  Fit_User7 ")).toBe("fit_user7");
    expect(validateUsername("  Fit_User7 ")).toBe("fit_user7");
  });

  it.each(["ab", "1runner", "runner-name", "runner!", "a".repeat(31)])(
    "rejects invalid username %s",
    (username) => {
      expect(() => validateUsername(username)).toThrow(InvalidUsernameError);
    },
  );
});

describe("ProfileRepository", () => {
  it("derives identity and applies an explicit owner filter on reads", async () => {
    const query = createReadQuery({
      user_id: USER_ID,
      username: "runner_one",
      created_at: "2026-07-23T08:00:00.000Z",
      ignored: "not exposed",
    });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(repository.getCurrentProfile()).resolves.toEqual({
      userId: USER_ID,
      username: "runner_one",
      createdAt: "2026-07-23T08:00:00.000Z",
    });

    expect(client.auth.getClaims).toHaveBeenCalledOnce();
    expect(query.select).toHaveBeenCalledWith("user_id, username, created_at");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("creates only for the verified current identity", async () => {
    const query = createInsertQuery({
      user_id: USER_ID,
      username: "runner_two",
      created_at: "2026-07-23T08:00:00.000Z",
    });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(
      repository.createCurrentProfile("  Runner_Two "),
    ).resolves.toEqual({
      userId: USER_ID,
      username: "runner_two",
      createdAt: "2026-07-23T08:00:00.000Z",
    });

    expect(query.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      username: "runner_two",
    });
  });

  it("rejects invalid input before making a table query", async () => {
    const table = vi.fn();
    const client = createClient(table);
    const repository = new ProfileRepository(client);

    await expect(repository.createCurrentProfile("bad-name")).rejects.toThrow(
      InvalidUsernameError,
    );
    expect(table).not.toHaveBeenCalled();
  });

  it("requires verified claims and does not expose provider errors", async () => {
    const rawProviderMessage = "provider token and project details";
    const table = vi.fn();
    const client = createClient(table, {
      data: null,
      error: new Error(rawProviderMessage),
    });
    const repository = new ProfileRepository(client);

    await expect(repository.getCurrentProfile()).rejects.toThrow(
      ProfileAuthenticationError,
    );

    try {
      await repository.getCurrentProfile();
    } catch (error) {
      expect(String(error)).not.toContain(rawProviderMessage);
    }
    expect(table).not.toHaveBeenCalled();
  });

  it("maps uniqueness failures to a safe domain error", async () => {
    const query = createInsertQuery(null, { code: "23505" });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(
      repository.createCurrentProfile("runner_three"),
    ).rejects.toThrow(UsernameUnavailableError);
  });

  it("maps unknown database failures without exposing details", async () => {
    const query = createReadQuery(null, {
      code: "XX000",
      message: "sensitive provider response",
    });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(repository.getCurrentProfile()).rejects.toThrow(
      ProfilePersistenceError,
    );
  });
});

function createClient(
  table: ReturnType<typeof vi.fn>,
  claims: unknown = {
    data: {
      claims: { sub: USER_ID },
      header: {},
      signature: new Uint8Array(),
    },
    error: null,
  },
): SupabaseClient<Database> {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(claims),
    },
    from: table,
  } as unknown as SupabaseClient<Database>;
}

function createReadQuery(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const table = vi.fn().mockReturnValue({ select });

  return { table, select, eq, maybeSingle };
}

function createInsertQuery(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const returningSelect = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select: returningSelect });
  const table = vi.fn().mockReturnValue({ insert });

  return { table, insert, returningSelect, single };
}
