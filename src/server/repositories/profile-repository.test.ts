import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  ProfileAuthenticationError,
  ProfilePersistenceError,
  ProfileRepository,
} from "@/server/repositories/profile-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("ProfileRepository", () => {
  afterEach(() => {
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  it("derives identity and applies an explicit owner filter on reads", async () => {
    const query = createReadQuery({
      user_id: USER_ID,
      created_at: "2026-07-23T08:00:00.000Z",
      ignored: "not exposed",
    });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(repository.getCurrentProfile()).resolves.toEqual({
      userId: USER_ID,
      createdAt: "2026-07-23T08:00:00.000Z",
    });

    expect(client.auth.getClaims).toHaveBeenCalledOnce();
    expect(query.select).toHaveBeenCalledWith("user_id, created_at");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("creates only for the verified current identity", async () => {
    const query = createInsertQuery({
      user_id: USER_ID,
      created_at: "2026-07-23T08:00:00.000Z",
    });
    const client = createClient(query.table);
    const repository = new ProfileRepository(client);

    await expect(repository.createCurrentProfile()).resolves.toEqual({
      userId: USER_ID,
      createdAt: "2026-07-23T08:00:00.000Z",
    });

    expect(query.insert).toHaveBeenCalledWith({ user_id: USER_ID });
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

  it("returns an existing profile when ensuring current profile", async () => {
    const query = createReadQuery({
      user_id: USER_ID,
      created_at: "2026-07-23T08:00:00.000Z",
    });
    const repository = new ProfileRepository(createClient(query.table));
    await expect(repository.ensureCurrentProfile()).resolves.toEqual({
      userId: USER_ID,
      createdAt: "2026-07-23T08:00:00.000Z",
    });
  });

  it("creates a profile when an authenticated user has no profile", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { user_id: USER_ID, created_at: "2026-07-23T08:00:00.000Z" },
      error: null,
    });
    const insert = vi
      .fn()
      .mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const table = vi.fn().mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      insert,
    });
    const repository = new ProfileRepository(createClient(table));
    await repository.ensureCurrentProfile();
    expect(insert).toHaveBeenCalledWith({ user_id: USER_ID });
  });

  it("rejects a founder-staging non-owner before reading profile data", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = USER_ID;
    const table = vi.fn();
    const repository = new ProfileRepository(
      createClient(table, {
        data: {
          claims: { sub: "00000000-0000-4000-8000-000000000002" },
        },
        error: null,
      }),
    );

    await expect(repository.getCurrentProfile()).rejects.toThrow(
      ProfileAuthenticationError,
    );
    expect(table).not.toHaveBeenCalled();
  });

  it("rejects a founder-staging non-owner before creating profile data", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = USER_ID;
    const table = vi.fn();
    const repository = new ProfileRepository(
      createClient(table, {
        data: {
          claims: { sub: "00000000-0000-4000-8000-000000000002" },
        },
        error: null,
      }),
    );

    await expect(repository.createCurrentProfile()).rejects.toThrow(
      ProfileAuthenticationError,
    );
    expect(table).not.toHaveBeenCalled();
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
