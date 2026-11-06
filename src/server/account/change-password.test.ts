import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAllowedVerifiedUserMock } = vi.hoisted(() => ({
  requireAllowedVerifiedUserMock: vi.fn(),
}));

vi.mock("@/lib/auth/verified-user", () => ({
  requireAllowedVerifiedUser: requireAllowedVerifiedUserMock,
}));

import { changeOwnPassword } from "./change-password";

const session = {
  auth: {
    getClaims: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
};
const checker = {
  auth: { signInWithPassword: vi.fn(), signOut: vi.fn() },
};
const makeChecker = vi.fn(() => checker);

const FORM = {
  current: "old-password-1",
  password: "new-password-2",
  confirmation: "new-password-2",
};

function change(form: Partial<typeof FORM> = {}) {
  return changeOwnPassword(session as never, makeChecker, { ...FORM, ...form });
}

describe("changeOwnPassword (ADR-042)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAllowedVerifiedUserMock.mockResolvedValue("owner-id");
    session.auth.getUser.mockResolvedValue({
      data: { user: { email: "owner@fittip.local" } },
      error: null,
    });
    session.auth.updateUser.mockResolvedValue({ error: null });
    session.auth.signOut.mockResolvedValue({ error: null });
    checker.auth.signInWithPassword.mockResolvedValue({ error: null });
    checker.auth.signOut.mockResolvedValue({ error: null });
  });

  it("checks the current password as the session's own address, then changes it and signs the others out", async () => {
    await expect(change()).resolves.toBe("changed");

    expect(checker.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@fittip.local",
      password: "old-password-1",
    });
    // The check's own session ends at once.
    expect(checker.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(session.auth.updateUser).toHaveBeenCalledWith({
      password: "new-password-2",
    });
    // Everyone else out; this device stays.
    expect(session.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it.each([
    ["too short", { password: "short", confirmation: "short" }],
    ["not matching", { confirmation: "new-password-3" }],
    ["not text", { password: 42 as unknown as string }],
  ])("refuses a new password %s before touching Auth", async (_, form) => {
    await expect(change(form)).resolves.toBe("validation");
    expect(requireAllowedVerifiedUserMock).not.toHaveBeenCalled();
    expect(makeChecker).not.toHaveBeenCalled();
    expect(session.auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses without a current password", async () => {
    await expect(change({ current: "" })).resolves.toBe("current");
    expect(makeChecker).not.toHaveBeenCalled();
  });

  it("says the session ended when there is no permitted signed-in person", async () => {
    requireAllowedVerifiedUserMock.mockRejectedValue(new Error("anonymous"));
    await expect(change()).resolves.toBe("session");
    expect(makeChecker).not.toHaveBeenCalled();

    requireAllowedVerifiedUserMock.mockResolvedValue("owner-id");
    session.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    await expect(change()).resolves.toBe("session");
    expect(makeChecker).not.toHaveBeenCalled();
  });

  it("changes nothing when the current password is wrong", async () => {
    checker.auth.signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials" },
    });
    await expect(change()).resolves.toBe("current");
    expect(session.auth.updateUser).not.toHaveBeenCalled();
    expect(session.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs nobody out when Auth refuses the new password", async () => {
    session.auth.updateUser.mockResolvedValue({
      error: { message: "New password should be different" },
    });
    await expect(change()).resolves.toBe("refused");
    expect(session.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not call a limit or an outage a wrong password", async () => {
    checker.auth.signInWithPassword.mockResolvedValue({
      error: { code: "over_request_rate_limit" },
    });
    await expect(change()).resolves.toBe("error");
    expect(session.auth.updateUser).not.toHaveBeenCalled();
  });

  it("is changed even when the backstop sign-out of the others fails", async () => {
    session.auth.signOut.mockRejectedValue(new Error("network"));
    await expect(change()).resolves.toBe("changed");
  });

  it("still changes it when the check's own sign-out fails", async () => {
    checker.auth.signOut.mockRejectedValue(new Error("network"));
    await expect(change()).resolves.toBe("changed");
  });
});
