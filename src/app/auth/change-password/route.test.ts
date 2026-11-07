import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeOwnPasswordMock, createServerUserClientMock } = vi.hoisted(
  () => ({
    changeOwnPasswordMock: vi.fn(),
    createServerUserClientMock: vi.fn(async (pending?: Response) => {
      pending?.headers.append("Set-Cookie", "sb-access=refreshed; Path=/");
      return {};
    }),
  }),
);

vi.mock("@/lib/supabase/server-user-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/supabase/server-user-client")>()),
  createServerUserClient: createServerUserClientMock,
}));
vi.mock("@/server/account/change-password", () => ({
  changeOwnPassword: changeOwnPasswordMock,
  createPasswordCheckClient: vi.fn(),
}));

import { POST } from "./route";

const origin = "https://fittip.example";

function post(from: string | null = origin) {
  const body = new FormData();
  body.set("current", "old-password-1");
  body.set("password", "new-password-2");
  body.set("confirmation", "new-password-2");
  return POST(
    new Request(`${origin}/auth/change-password`, {
      method: "POST",
      body,
      headers: from === null ? {} : { origin: from },
    }),
  );
}

function location(response: Response) {
  const url = new URL(response.headers.get("location") ?? "");
  return `${url.pathname}${url.search}`;
}

describe("POST /auth/change-password (ADR-042)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changeOwnPasswordMock.mockResolvedValue("changed");
  });

  it("hands the form to the change and goes back to the page, keeping the session's cookies", async () => {
    const response = await post();

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/home/you/settings?password=changed");
    expect(response.headers.get("set-cookie")).toContain("sb-access=refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    ["validation", "?error=validation"],
    ["session", "?error=session"],
    ["current", "?error=current"],
    ["refused", "?error=refused"],
    ["error", "?error=error"],
  ])("answers %s with a fixed key and nothing typed", async (result, query) => {
    changeOwnPasswordMock.mockResolvedValue(result);
    const response = await post();
    expect(location(response)).toBe(`/home/you/settings/password${query}`);
    expect(location(response)).not.toContain("password-");
  });

  it("refuses another site's form before reading anything", async () => {
    const response = await post("https://elsewhere.example");
    expect(response.status).toBe(403);
    expect(createServerUserClientMock).not.toHaveBeenCalled();
    expect(changeOwnPasswordMock).not.toHaveBeenCalled();
  });
});
