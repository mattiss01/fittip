import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, createServerUserClientMock, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  const client = {
    auth: {
      getClaims: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
    },
  };
  return {
    calls,
    client,
    createServerUserClientMock: vi.fn(async (pending?: Response) => {
      pending?.headers.append("Set-Cookie", "sb-session=cleared; Path=/");
      return client;
    }),
  };
});

// The mail is asked for after the answer has gone out. There is no request
// to outlive here, so the work is run and awaited by the test.
const afterWork: Promise<unknown>[] = [];
vi.mock("next/server", async (importActual) => ({
  ...(await importActual<typeof import("next/server")>()),
  after: (work: () => Promise<unknown>) => {
    afterWork.push(work());
  },
}));
const settled = async () => {
  await Promise.all(afterWork.splice(0));
};

vi.mock("@/lib/supabase/server-user-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/supabase/server-user-client")>()),
  createServerUserClient: createServerUserClientMock,
}));

import { POST as forgot } from "@/app/auth/forgot/route";
import { POST as reset } from "@/app/auth/reset/route";

const origin = "https://fittip.example";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "a-new-password";

function post(pathname: string, values: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  return new Request(`${origin}${pathname}`, { method: "POST", body });
}

function expectPrivate303(response: Response, destination: string) {
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location") ?? "");
  expect(`${location.pathname}${location.search}`).toBe(destination);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
}

const resetForm = (values: Partial<Record<string, string>> = {}) =>
  post("/auth/reset", {
    token_hash: "pkce_abc",
    password: PASSWORD,
    confirmation: PASSWORD,
    ...values,
  } as Record<string, string>);

describe("password recovery route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    calls.length = 0;
    client.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    client.auth.verifyOtp.mockImplementation(async () => {
      calls.push("verify");
      return { error: null };
    });
    client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: OWNER } },
      error: null,
    });
    client.auth.updateUser.mockImplementation(async () => {
      calls.push("update");
      return { error: null };
    });
    client.auth.signOut.mockImplementation(
      async (options?: { scope?: string }) => {
        calls.push(`signOut:${options?.scope ?? "default"}`);
        return { error: null };
      },
    );
  });

  describe("asking for a link", () => {
    it("gives one answer for an account, no account, and a failure", async () => {
      const sent = "/forgot-password?sent=1";

      expectPrivate303(
        await forgot(post("/auth/forgot", { email: " owner@example.test " })),
        sent,
      );
      await settled();
      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "owner@example.test",
      );

      client.auth.resetPasswordForEmail.mockResolvedValue({
        error: { message: "over_email_send_rate_limit" },
      });
      expectPrivate303(
        await forgot(post("/auth/forgot", { email: "nobody@example.test" })),
        sent,
      );

      client.auth.resetPasswordForEmail.mockRejectedValue(new Error("down"));
      expectPrivate303(
        await forgot(post("/auth/forgot", { email: "owner@example.test" })),
        sent,
      );
      await settled();
      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledTimes(3);
    });

    it("answers without waiting for Auth, so the delay says nothing either", async () => {
      // Auth never answers; the route does.
      client.auth.resetPasswordForEmail.mockReturnValue(new Promise(() => {}));

      expectPrivate303(
        await forgot(post("/auth/forgot", { email: "owner@example.test" })),
        "/forgot-password?sent=1",
      );
      afterWork.length = 0;
    });

    it("hands Auth nothing for an empty or absurd address", async () => {
      await forgot(post("/auth/forgot", { email: "  " }));
      await forgot(
        post("/auth/forgot", { email: `${"a".repeat(320)}@x.test` }),
      );

      expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });

  describe("setting the new password", () => {
    it("verifies the link, sets the password and ends every session", async () => {
      const response = await reset(resetForm());

      expectPrivate303(response, "/?auth=password-changed");
      expect(client.auth.verifyOtp).toHaveBeenCalledWith({
        type: "recovery",
        token_hash: "pkce_abc",
      });
      expect(client.auth.updateUser).toHaveBeenCalledWith({
        password: PASSWORD,
      });
      expect(calls).toEqual(["verify", "update", "signOut:global"]);
      // What signing out did to this browser's cookies reaches it.
      expect(response.headers.getSetCookie()).toEqual([
        "sb-session=cleared; Path=/",
      ]);
    });

    it("checks the passwords before the link is spent", async () => {
      for (const values of [
        { password: "short", confirmation: "short" },
        { confirmation: "another-password" },
      ]) {
        const response = await reset(resetForm(values));

        // Back on the form, the link still in hand.
        expectPrivate303(
          response,
          "/reset-password?token_hash=pkce_abc&error=validation",
        );
      }
      expect(createServerUserClientMock).not.toHaveBeenCalled();
      expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    });

    it("refuses a missing, oversized, expired or used link", async () => {
      expectPrivate303(
        await reset(resetForm({ token_hash: "" })),
        "/forgot-password?error=link",
      );
      expectPrivate303(
        await reset(resetForm({ token_hash: "x".repeat(501) })),
        "/forgot-password?error=link",
      );
      expect(client.auth.verifyOtp).not.toHaveBeenCalled();

      client.auth.verifyOtp.mockResolvedValue({
        error: { message: "otp_expired" },
      });
      expectPrivate303(await reset(resetForm()), "/forgot-password?error=link");
      expect(client.auth.updateUser).not.toHaveBeenCalled();
    });

    it("never changes the password of an account this environment does not allow", async () => {
      vi.stubEnv("FITTIP_RUNTIME_MODE", "founder-staging");
      vi.stubEnv("FITTIP_OWNER_USER_ID", OWNER);
      client.auth.getClaims.mockResolvedValue({
        data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } },
        error: null,
      });

      expectPrivate303(await reset(resetForm()), "/forgot-password?error=link");

      expect(client.auth.updateUser).not.toHaveBeenCalled();
      // This request's session only: the account's devices stay signed in.
      expect(calls).toEqual(["verify", "signOut:local"]);
    });

    it("lets the owner's account through on the hosted environment", async () => {
      vi.stubEnv("FITTIP_RUNTIME_MODE", "founder-staging");
      vi.stubEnv("FITTIP_OWNER_USER_ID", OWNER);

      expectPrivate303(await reset(resetForm()), "/?auth=password-changed");
      expect(calls).toEqual(["verify", "update", "signOut:global"]);
    });

    it("signs out and says so when Auth refuses the password", async () => {
      client.auth.updateUser.mockResolvedValue({
        error: { message: "same_password" },
      });

      expectPrivate303(
        await reset(resetForm()),
        "/forgot-password?error=password",
      );
      expect(calls).toEqual(["verify", "signOut:local"]);
    });

    it("leaves no session behind when Auth fails outright after the link is spent", async () => {
      client.auth.updateUser.mockRejectedValue(new Error("down"));

      expectPrivate303(
        await reset(resetForm()),
        "/forgot-password?error=password",
      );
      expect(calls).toEqual(["verify", "signOut:local"]);
    });

    it("signs this browser out even when the others could not be", async () => {
      client.auth.signOut.mockImplementation(
        async (options?: { scope?: string }) => {
          calls.push(`signOut:${options?.scope ?? "default"}`);
          return {
            error: options?.scope === "global" ? { message: "down" } : null,
          };
        },
      );

      expectPrivate303(await reset(resetForm()), "/?auth=password-changed");
      expect(calls).toEqual([
        "verify",
        "update",
        "signOut:global",
        "signOut:local",
      ]);
    });
  });
});
