import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, createServerUserClientMock } = vi.hoisted(() => {
  const client = {
    rpc: vi.fn(),
    auth: { signOut: vi.fn() },
  };
  return {
    client,
    createServerUserClientMock: vi.fn(async (pending?: Response) => {
      pending?.headers.append("Set-Cookie", "sb-access=; Max-Age=0; Path=/");
      return client;
    }),
  };
});

vi.mock("@/lib/supabase/server-user-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/supabase/server-user-client")>()),
  createServerUserClient: createServerUserClientMock,
}));

import { POST } from "./route";

const origin = "https://fittip.example";

function post(confirmation: string | null, from: string | null = origin) {
  const body = new FormData();
  if (confirmation !== null) body.set("confirmation", confirmation);
  return POST(
    new Request(`${origin}/auth/delete-account`, {
      method: "POST",
      body,
      headers: from === null ? {} : { origin: from },
    }),
  );
}

function location(response: Response) {
  const url = new URL(response.headers.get("location") ?? "");
  return `${url.pathname}${url.search}${url.hash}`;
}

describe("POST /auth/delete-account (ADR-039)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.rpc.mockResolvedValue({ error: null });
    client.auth.signOut.mockResolvedValue({ error: null });
  });

  it("deletes the account, clears the browser session and lands on sign-in", async () => {
    const response = await post("DELETE");

    expect(client.rpc).toHaveBeenCalledWith("delete_my_account", {
      p_confirmation: "DELETE",
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(location(response)).toBe("/?auth=deleted");
    expect(response.headers.get("set-cookie")).toContain("sb-access=");
  });

  it("asks nothing of the database unless DELETE was typed exactly", async () => {
    for (const typed of ["delete", "DELETE ", "", null]) {
      const response = await post(typed);
      expect(location(response)).toBe(
        "/home/you/settings?delete=confirmation#delete-account",
      );
    }
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("sends a signed-out caller back without signing anyone out", async () => {
    client.rpc.mockResolvedValue({ error: { code: "42501" } });
    const response = await post("DELETE");
    expect(location(response)).toBe(
      "/home/you/settings?delete=session#delete-account",
    );
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("reports a failed delete and keeps the session", async () => {
    client.rpc.mockResolvedValue({ error: { code: "XX000" } });
    const response = await post("DELETE");
    expect(location(response)).toBe(
      "/home/you/settings?delete=error#delete-account",
    );
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a form posted from another site before reading it", async () => {
    const response = await post("DELETE", "https://elsewhere.example");
    expect(response.status).toBe(403);
    expect(createServerUserClientMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
