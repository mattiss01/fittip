import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock, getClaimsMock, signOutMock } = vi.hoisted(
  () => ({
    createServerClientMock: vi.fn(),
    getClaimsMock: vi.fn(),
    signOutMock: vi.fn(),
  }),
);

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { proxy } from "@/proxy";

const cacheControl = "private, no-cache, no-store, must-revalidate, max-age=0";

function request(pathname = "/home") {
  return new NextRequest(`https://fittip.example${pathname}`);
}

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe(cacheControl);
  expect(response.headers.get("Expires")).toBe("0");
  expect(response.headers.get("Pragma")).toBe("no-cache");
}

describe("production auth proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
    createServerClientMock.mockReturnValue({
      auth: { getClaims: getClaimsMock, signOut: signOutMock },
    });
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
  });

  it("redirects an anonymous protected request with exact private headers", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: {} },
      error: new Error(),
    });
    const response = await proxy(request());
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expectPrivateHeaders(response);
  });

  it("preserves refresh cookies and supplied single-valued headers", async () => {
    createServerClientMock.mockImplementation((_url, _key, options) => {
      options.cookies.setAll(
        [{ name: "sb-refresh", value: "fresh", options: { httpOnly: true } }],
        { "X-Auth-Refresh": "present", "Cache-Control": "unsafe" },
      );
      return { auth: { getClaims: getClaimsMock, signOut: signOutMock } };
    });
    const response = await proxy(request());
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      "sb-refresh=fresh; Path=/; HttpOnly",
    ]);
    expect(response.headers.get("X-Auth-Refresh")).toBe("present");
    expectPrivateHeaders(response);
  });

  it("keeps a refreshed anonymous redirect cookie and exact headers", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: {} }, error: null });
    createServerClientMock.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "sb-refresh", value: "fresh" }]);
      return { auth: { getClaims: getClaimsMock, signOut: signOutMock } };
    });
    const response = await proxy(request());
    expect(response.status).toBe(303);
    expect(response.headers.getSetCookie()).toEqual([
      "sb-refresh=fresh; Path=/",
    ]);
    expectPrivateHeaders(response);
  });

  it("denies and signs out a non-owner founder-staging session", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } },
      error: null,
    });

    const response = await proxy(request());

    expect(response.status).toBe(303);
    expect(signOutMock).toHaveBeenCalledOnce();
    expectPrivateHeaders(response);
  });

  it("allows the configured founder-staging owner", async () => {
    const ownerId = "00000000-0000-4000-8000-000000000001";
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = ownerId;
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: ownerId } },
      error: null,
    });

    const response = await proxy(request());

    expect(response.status).toBe(200);
    expect(signOutMock).not.toHaveBeenCalled();
    expectPrivateHeaders(response);
  });

  it("redirects founder staging signup before constructing a Supabase client", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";

    const response = await proxy(request("/signup"));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expect(createServerClientMock).not.toHaveBeenCalled();
    expectPrivateHeaders(response);
  });
});
