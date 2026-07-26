import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerUserClientMock,
  getCurrentProfileMock,
  ProfileAuthenticationErrorMock,
  redirectMock,
} = vi.hoisted(() => {
  class ProfileAuthenticationErrorMock extends Error {
    constructor(readonly accessError?: unknown) {
      super("An authenticated FitTip user is required.");
    }
  }

  return {
    createServerUserClientMock: vi.fn(),
    getCurrentProfileMock: vi.fn(),
    ProfileAuthenticationErrorMock,
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/supabase/server-user-client", () => ({
  createServerUserClient: createServerUserClientMock,
}));

vi.mock("@/server/repositories/profile-repository", () => ({
  ProfileAuthenticationError: ProfileAuthenticationErrorMock,
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

  it("allows the configured owner after the repository verifies Auth claims", async () => {
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

  it("routes a non-owner to the narrow server-side signout path", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = OWNER_ID;
    createServerUserClientMock.mockResolvedValue({});
    getCurrentProfileMock.mockRejectedValue(
      new ProfileAuthenticationErrorMock({
        policy: { mode: "founder-staging", ownerUserId: OWNER_ID },
        reason: "not-owner",
      }),
    );

    await expect(ProtectedHome()).rejects.toThrow("redirect:/auth/denied");
    expect(getCurrentProfileMock).toHaveBeenCalledOnce();
  });

  it("denies anonymous sessions after the repository boundary verifies access", async () => {
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
    createServerUserClientMock.mockResolvedValue({});
    getCurrentProfileMock.mockRejectedValue(
      new ProfileAuthenticationErrorMock(),
    );

    await expect(ProtectedHome()).rejects.toThrow("redirect:/");
    expect(getCurrentProfileMock).toHaveBeenCalledOnce();
  });
});
