import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerUserClientMock, getCurrentProfileMock, redirectMock } =
  vi.hoisted(() => ({
    createServerUserClientMock: vi.fn(),
    getCurrentProfileMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));

vi.mock("@/server/repositories/profile-repository", () => ({
  ProfileRepository: class {
    getCurrentProfile = getCurrentProfileMock;
  },
}));

import ProtectedHome from "./page";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

describe("ProtectedHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
  });

  it("allows the configured owner after the page verifies Auth claims", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = OWNER_ID;
    createServerUserClientMock.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: OWNER_ID } },
          error: null,
        }),
      },
    });
    getCurrentProfileMock.mockResolvedValue({ userId: OWNER_ID });

    await expect(ProtectedHome()).resolves.toEqual(expect.anything());
    expect(getCurrentProfileMock).toHaveBeenCalledOnce();
  });

  it("denies a non-owner even if proxy interception is bypassed", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = OWNER_ID;
    createServerUserClientMock.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: { sub: "00000000-0000-4000-8000-000000000002" },
          },
          error: null,
        }),
      },
    });

    await expect(ProtectedHome()).rejects.toThrow("redirect:/");
    expect(getCurrentProfileMock).not.toHaveBeenCalled();
  });

  it("denies anonymous sessions without reading a profile", async () => {
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
    createServerUserClientMock.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: {} },
          error: null,
        }),
      },
    });

    await expect(ProtectedHome()).rejects.toThrow("redirect:/");
    expect(getCurrentProfileMock).not.toHaveBeenCalled();
  });
});
