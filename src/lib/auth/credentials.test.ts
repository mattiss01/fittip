import { describe, expect, it } from "vitest";

import {
  INVALID_CREDENTIALS_MESSAGE,
  mapSignInError,
  validateSignUpCredentials,
} from "@/lib/auth/credentials";

describe("account credentials", () => {
  it("requires an eight-character password before signup reaches Auth", () => {
    expect(validateSignUpCredentials("seven77", "seven77")).toEqual({
      valid: false,
      message: "Use at least 8 characters for your password.",
    });
  });

  it("requires matching confirmation without imposing an arbitrary composition rule", () => {
    expect(validateSignUpCredentials("eight888", "different")).toEqual({
      valid: false,
      message: "Your passwords do not match.",
    });
    expect(validateSignUpCredentials("eight888", "eight888")).toEqual({
      valid: true,
    });
  });

  it("keeps sign-in failures generic", () => {
    expect(mapSignInError()).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(mapSignInError()).not.toContain("email");
  });
});
