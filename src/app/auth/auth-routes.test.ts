import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, createServerUserClientMock, ensureCurrentProfileMock } =
  vi.hoisted(() => {
    const client = {
      auth: {
        exchangeCodeForSession: vi.fn(),
        getClaims: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    };

    return {
      client,
      createServerUserClientMock: vi.fn(async (pending?: Response) => {
        pending?.headers.append("Set-Cookie", "sb-refresh=updated; Path=/");
        pending?.headers.set("X-Auth-Refresh", "present");
        return client;
      }),
      ensureCurrentProfileMock: vi.fn(),
    };
  });

vi.mock("@/lib/supabase/server-user-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/supabase/server-user-client")>()),
  createServerUserClient: createServerUserClientMock,
}));

vi.mock("@/server/repositories/profile-repository", () => ({
  ProfileRepository: class {
    ensureCurrentProfile = ensureCurrentProfileMock;
  },
}));

import { GET as callback } from "@/app/auth/callback/route";
import { POST as signin } from "@/app/auth/signin/route";
import { POST as signout } from "@/app/auth/signout/route";
import { POST as signup } from "@/app/auth/signup/route";

const origin = "https://fittip.example";
const sessionCacheControl =
  "private, no-cache, no-store, must-revalidate, max-age=0";

function expectPrivate303(
  response: Response,
  pathname: string,
  hasPendingHeaders = true,
) {
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
    pathname,
  );
  expect(response.headers.get("Cache-Control")).toBe(sessionCacheControl);
  expect(response.headers.get("Expires")).toBe("0");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(response.headers.getSetCookie()).toEqual(
    hasPendingHeaders ? ["sb-refresh=updated; Path=/"] : [],
  );
  expect(response.headers.get("X-Auth-Refresh")).toBe(
    hasPendingHeaders ? "present" : null,
  );
}

function post(pathname: string, values: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  return new Request(`${origin}${pathname}`, { method: "POST", body });
}

describe("production authentication route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    client.auth.signInWithPassword.mockResolvedValue({ error: null });
    client.auth.signUp.mockResolvedValue({ error: null });
    client.auth.signOut.mockResolvedValue({ error: null });
    ensureCurrentProfileMock.mockResolvedValue(undefined);
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
  });

  it("returns a generic private 303 when the callback code is missing", async () => {
    const response = await callback(new Request(`${origin}/auth/callback`));
    expectPrivate303(response, "/", false);
    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get("auth"),
    ).toBe("confirmation-failed");
  });

  it("returns a generic private 303 when exchanging a callback code fails", async () => {
    client.auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error(),
    });
    const response = await callback(
      new Request(`${origin}/auth/callback?code=bad-code`),
    );
    expectPrivate303(response, "/");
  });

  it("redirects a confirmed account to home with exactly composed headers", async () => {
    const response = await callback(
      new Request(`${origin}/auth/callback?code=valid-code`),
    );
    expectPrivate303(response, "/home");
    expect(ensureCurrentProfileMock).toHaveBeenCalledOnce();
  });

  it("returns the generic callback response when profile provisioning fails", async () => {
    ensureCurrentProfileMock.mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await callback(
      new Request(`${origin}/auth/callback?code=valid-code`),
    );
    expectPrivate303(response, "/");
  });

  it("keeps invalid sign-in responses generic and post-safe", async () => {
    client.auth.signInWithPassword.mockResolvedValue({ error: new Error() });
    const response = await signin(
      post("/auth/signin", {
        email: "missing@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/");
    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get("error"),
    ).toBe("credentials");
  });

  it("signs in and provisions the current profile before redirecting home", async () => {
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/home");
    expect(ensureCurrentProfileMock).toHaveBeenCalledOnce();
  });

  it("signs out again and returns a generic response when sign-in provisioning fails", async () => {
    ensureCurrentProfileMock.mockRejectedValue(new Error("profile failure"));
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/");
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("does not replay a credential POST with a 307 redirect", async () => {
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expect(response.status).toBe(303);
  });

  it("rejects invalid signup data with a private 303 before calling Auth", async () => {
    const response = await signup(
      post("/auth/signup", {
        email: "new@example.com",
        password: "short",
        confirmation: "short",
      }),
    );
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").search).toBe(
      "?error=validation",
    );
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("uses the request origin for signup confirmation and returns a private 303", async () => {
    const response = await signup(
      post("/auth/signup", {
        email: "new@example.com",
        password: "password",
        confirmation: "password",
      }),
    );
    expectPrivate303(response, "/signup");
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: `${origin}/auth/callback` },
      }),
    );
  });

  it("returns a private generic signup failure", async () => {
    client.auth.signUp.mockResolvedValue({ error: new Error() });
    const response = await signup(
      post("/auth/signup", {
        email: "new@example.com",
        password: "password",
        confirmation: "password",
      }),
    );
    expectPrivate303(response, "/signup");
  });

  it("signs out through the production route handler with a private 303", async () => {
    const response = await signout(
      new Request(`${origin}/auth/signout`, { method: "POST" }),
    );
    expectPrivate303(response, "/");
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("closes hosted signup before constructing an Auth client", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";

    const response = await signup(
      post("/auth/signup", {
        email: "new@example.com",
        password: "password",
        confirmation: "password",
      }),
    );

    expectPrivate303(response, "/", false);
    expect(createServerUserClientMock).not.toHaveBeenCalled();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it("signs out a non-owner after hosted sign-in before profile creation", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } },
      error: null,
    });

    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );

    expectPrivate303(response, "/");
    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(ensureCurrentProfileMock).not.toHaveBeenCalled();
  });

  it("signs out a non-owner after hosted callback before profile creation", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } },
      error: null,
    });

    const response = await callback(
      new Request(`${origin}/auth/callback?code=valid-code`),
    );

    expectPrivate303(response, "/");
    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(ensureCurrentProfileMock).not.toHaveBeenCalled();
  });
});
