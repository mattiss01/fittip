import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, cookiesMock, cookieStore } = vi.hoisted(() => {
  const cookieStore = {
    getAll: vi.fn().mockReturnValue([
      {
        name: "sb-local-auth-token",
        value: "session-cookie",
      },
    ]),
    set: vi.fn(),
  };

  return {
    cookieStore,
    cookiesMock: vi.fn().mockResolvedValue(cookieStore),
    createServerClientMock: vi.fn().mockReturnValue({ kind: "user-client" }),
  };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import {
  createServerUserClient,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

describe("createServerUserClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it("creates a request-scoped SSR client with the publishable key and cookies", async () => {
    await expect(createServerUserClient()).resolves.toEqual({
      kind: "user-client",
    });

    expect(cookiesMock).toHaveBeenCalledOnce();
    expect(createServerClientMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "sb_publishable_test",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );

    const options = createServerClientMock.mock.calls[0]?.[2];
    expect(options.cookies.getAll()).toEqual([
      {
        name: "sb-local-auth-token",
        value: "session-cookie",
      },
    ]);

    options.cookies.setAll([
      {
        name: "sb-local-auth-token",
        value: "refreshed",
        options: { httpOnly: true },
      },
    ]);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "sb-local-auth-token",
      "refreshed",
      { httpOnly: true },
    );
  });
});

describe("privateRedirect", () => {
  it("uses a post-safe redirect and exact private cache controls", () => {
    const response = privateRedirect(new URL("http://localhost:3000/home"));
    expect(response.status).toBe(303);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });
});
