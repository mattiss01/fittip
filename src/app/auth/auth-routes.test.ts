import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  client,
  createServerUserClientMock,
  ensureCurrentProfileMock,
  getCurrentProfileMock,
  startSetupMock,
  getSetupStateMock,
} = vi.hoisted(() => {
  const client = {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getClaims: vi.fn(),
      getUser: vi.fn(),
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
    getCurrentProfileMock: vi.fn(),
    startSetupMock: vi.fn(),
    getSetupStateMock: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server-user-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/supabase/server-user-client")>()),
  createServerUserClient: createServerUserClientMock,
}));

vi.mock("@/server/repositories/profile-repository", () => ({
  ProfileRepository: class {
    ensureCurrentProfile = ensureCurrentProfileMock;
    getCurrentProfile = getCurrentProfileMock;
    // Where setup stands is the profile's since 6 Oct 2026.
    startSetup = startSetupMock;
    getSetupState = getSetupStateMock;
  },
}));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as denied } from "@/app/auth/denied/route";
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
    client.auth.getUser.mockResolvedValue({
      data: { user: { confirmation_sent_at: "2026-10-05T10:00:00Z" } },
    });
    ensureCurrentProfileMock.mockResolvedValue(undefined);
    // An account that has signed in before, unless a test says otherwise.
    getCurrentProfileMock.mockResolvedValue({ userId: "user-1" });
    startSetupMock.mockResolvedValue(undefined);
    // Never begun, unless a test says otherwise.
    getSetupStateMock.mockResolvedValue({
      step: null,
      finished: false,
      skipped: false,
    });
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
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

  /** The link confirms the account and leaves it signed out on sign-in. */
  function expectConfirmedAndSignedOut(response: Response) {
    expectPrivate303(response, "/");
    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get("auth"),
    ).toBe("confirmed");
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  }

  it("confirms an account, begins its guided setup and leaves it signed out on sign-in, with exactly composed headers", async () => {
    const response = await callback(
      new Request(`${origin}/auth/callback?code=valid-code`),
    );
    expectConfirmedAndSignedOut(response);
    expect(ensureCurrentProfileMock).toHaveBeenCalledOnce();
    // Beginning leaves a finished or already begun setup as it is; that is
    // the repository's rule, so the route asks every time.
    expect(startSetupMock).toHaveBeenCalledOnce();
  });

  it("still confirms an account whose setup cannot be begun", async () => {
    startSetupMock.mockRejectedValue(new Error("database unavailable"));
    const response = await callback(
      new Request(`${origin}/auth/callback?code=valid-code`),
    );
    expectConfirmedAndSignedOut(response);
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
    expectPrivate303(response, "/home/today");
    expect(ensureCurrentProfileMock).toHaveBeenCalledOnce();
  });

  it("opens guided setup on the sign-in that follows a confirmation", async () => {
    // Confirming began setup, and the owner has not skipped it.
    getSetupStateMock.mockResolvedValue({
      step: 1,
      finished: false,
      skipped: false,
    });
    const response = await signin(
      post("/auth/signin", {
        email: "new@example.com",
        password: "password",
        // Setup comes first even when the sign-in page carried a way back.
        next: "/home/plan",
      }),
    );
    expectPrivate303(response, "/home/you/onboarding");
    expect(new URL(response.headers.get("location") ?? "").search).toBe("");
  });

  it("starts setup at the first sign-in of an account whose confirmation never reached the callback", async () => {
    // Confirmed in another browser: no profile exists and nothing was begun.
    getCurrentProfileMock.mockResolvedValue(null);
    startSetupMock.mockImplementation(async () => {
      getSetupStateMock.mockResolvedValue({
        step: 1,
        finished: false,
        skipped: false,
      });
    });
    const response = await signin(
      post("/auth/signin", { email: "new@example.com", password: "password" }),
    );
    expect(startSetupMock).toHaveBeenCalledOnce();
    expectPrivate303(response, "/home/you/onboarding");
  });

  it("does not start setup at the first sign-in of an account that never signed up here", async () => {
    getCurrentProfileMock.mockResolvedValue(null);
    client.auth.getUser.mockResolvedValue({ data: { user: {} } });
    const response = await signin(
      post("/auth/signin", { email: "made@example.com", password: "password" }),
    );
    expect(startSetupMock).not.toHaveBeenCalled();
    expectPrivate303(response, "/home/today");
  });

  it("does not start setup for an older account that never ran it", async () => {
    const response = await signin(
      post("/auth/signin", { email: "old@example.com", password: "password" }),
    );
    expect(startSetupMock).not.toHaveBeenCalled();
    expectPrivate303(response, "/home/today");
  });

  it("asks rather than opens setup once the owner has chosen Continue later", async () => {
    getSetupStateMock.mockResolvedValue({
      step: 8,
      finished: false,
      skipped: true,
    });
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/home/you/onboarding");
    expect(new URL(response.headers.get("location") ?? "").search).toBe(
      "?remind=1",
    );
  });

  it.each([
    ["a finished setup", { step: 12, finished: true, skipped: true }],
    ["a setup never begun", { step: null, finished: false, skipped: false }],
  ])("signs in to Today with %s", async (_label, setup) => {
    getSetupStateMock.mockResolvedValue(setup);
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/home/today");
  });

  it("does not let unreadable setup state cost a sign-in", async () => {
    getSetupStateMock.mockRejectedValue(new Error("database unavailable"));
    const response = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
      }),
    );
    expectPrivate303(response, "/home/today");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not look for setup when the sign-in is refused", async () => {
    client.auth.signInWithPassword.mockResolvedValue({ error: new Error() });
    await signin(
      post("/auth/signin", {
        email: "missing@example.com",
        password: "password",
      }),
    );
    expect(getSetupStateMock).not.toHaveBeenCalled();
  });

  it("restores only an allowlisted same-origin private destination", async () => {
    const allowed = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
        next: "/home/progress",
      }),
    );
    expectPrivate303(allowed, "/home/progress");

    const rejected = await signin(
      post("/auth/signin", {
        email: "member@example.com",
        password: "password",
        next: "https://attacker.example/home/progress",
      }),
    );
    expectPrivate303(rejected, "/home/today");
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

  it("does not sign out the configured founder when denial fallback is revisited", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    const response = await denied(new Request(`${origin}/auth/denied`));

    expectPrivate303(response, "/");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out an anonymous founder-staging request", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    client.auth.getClaims.mockResolvedValue({
      data: { claims: {} },
      error: null,
    });
    const response = await denied(new Request(`${origin}/auth/denied`));

    expectPrivate303(response, "/");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("clears only a verified founder-staging non-owner session locally", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } },
      error: null,
    });
    const response = await denied(new Request(`${origin}/auth/denied`));

    expectPrivate303(response, "/");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not create a session client for the founder-only denial route locally", async () => {
    const response = await denied(new Request(`${origin}/auth/denied`));

    expectPrivate303(response, "/", false);
    expect(createServerUserClientMock).not.toHaveBeenCalled();
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
