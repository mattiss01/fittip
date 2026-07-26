import { describe, expect, it } from "vitest";

import {
  isAllowedVerifiedUser,
  readRuntimePolicy,
  RuntimePolicyError,
} from "@/lib/auth/runtime-policy";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

describe("readRuntimePolicy", () => {
  it("keeps local development as the safe default", () => {
    expect(readRuntimePolicy({})).toEqual({
      mode: "local",
      ownerUserId: null,
    });
  });

  it("enables founder staging only for the exact mode and canonical owner UUID", () => {
    expect(
      readRuntimePolicy({
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
      }),
    ).toEqual({ mode: "founder-staging", ownerUserId: OWNER_ID });
  });

  it.each([
    [{ FITTIP_RUNTIME_MODE: "Founder-staging" }, "FITTIP_RUNTIME_MODE"],
    [{ FITTIP_RUNTIME_MODE: "founder-staging" }, "FITTIP_OWNER_USER_ID"],
    [
      {
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: "00000000-0000-4000-8000-00000000000A",
      },
      "FITTIP_OWNER_USER_ID",
    ],
  ])(
    "fails closed for invalid hosted configuration",
    (environment, variable) => {
      expect(() => readRuntimePolicy(environment)).toThrow(
        new RuntimePolicyError(variable),
      );
    },
  );

  it.each([
    { environment: { VERCEL: "1" }, scope: "production Vercel runtime" },
    { environment: { VERCEL_ENV: "preview" }, scope: "preview Vercel runtime" },
    {
      environment: { VERCEL_ENV: "development" },
      scope: "other Vercel runtime",
    },
  ])("never defaults to local in $scope", ({ environment }) => {
    expect(() => readRuntimePolicy(environment)).toThrow(
      new RuntimePolicyError("FITTIP_RUNTIME_MODE"),
    );
  });

  it("requires a canonical owner UUID in every Vercel environment", () => {
    expect(() =>
      readRuntimePolicy({
        VERCEL_ENV: "preview",
        FITTIP_RUNTIME_MODE: "founder-staging",
      }),
    ).toThrow(new RuntimePolicyError("FITTIP_OWNER_USER_ID"));
  });
});

describe("isAllowedVerifiedUser", () => {
  it("allows every verified user locally while owner-locking founder staging", () => {
    const staging = readRuntimePolicy({
      FITTIP_RUNTIME_MODE: "founder-staging",
      FITTIP_OWNER_USER_ID: OWNER_ID,
    });

    expect(isAllowedVerifiedUser(readRuntimePolicy({}), "other-user")).toBe(
      true,
    );
    expect(isAllowedVerifiedUser(staging, OWNER_ID)).toBe(true);
    expect(isAllowedVerifiedUser(staging, "other-user")).toBe(false);
    expect(isAllowedVerifiedUser(staging, undefined)).toBe(false);
  });
});
