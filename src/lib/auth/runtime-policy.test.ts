import { describe, expect, it } from "vitest";

import {
  isAllowedVerifiedUser,
  readRuntimePolicy,
  RuntimePolicyError,
} from "@/lib/auth/runtime-policy";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const FRIEND_ID = "00000000-0000-4000-8000-000000000002";
const ALLOWED_USERS_VARIABLE = "FITTIP_ALLOWED_USER_IDS";

function staging(list: string | undefined) {
  return {
    FITTIP_RUNTIME_MODE: "founder-staging",
    ...(list === undefined ? {} : { [ALLOWED_USERS_VARIABLE]: list }),
  };
}

function canonicalIdList(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ).join(",");
}

describe("readRuntimePolicy", () => {
  it("keeps local development as the safe default", () => {
    expect(readRuntimePolicy({})).toEqual({
      mode: "local",
      allowedUserIds: null,
    });
  });

  it("enables founder staging only for the exact mode and a list of canonical UUIDs", () => {
    expect(readRuntimePolicy(staging(OWNER_ID))).toEqual({
      mode: "founder-staging",
      allowedUserIds: [OWNER_ID],
    });
    expect(readRuntimePolicy(staging(` ${OWNER_ID} , ${FRIEND_ID} `))).toEqual({
      mode: "founder-staging",
      allowedUserIds: [OWNER_ID, FRIEND_ID],
    });
  });

  it("drops a repeated id", () => {
    expect(
      readRuntimePolicy(staging(`${OWNER_ID},${FRIEND_ID},${OWNER_ID}`))
        .allowedUserIds,
    ).toEqual([OWNER_ID, FRIEND_ID]);
  });

  it("admits the owner and five friends, and no more", () => {
    expect(
      readRuntimePolicy(staging(canonicalIdList(6))).allowedUserIds,
    ).toHaveLength(6);
    expect(() => readRuntimePolicy(staging(canonicalIdList(7)))).toThrow(
      new RuntimePolicyError(ALLOWED_USERS_VARIABLE),
    );
  });

  it("counts a seventh entry even when it repeats one", () => {
    expect(() =>
      readRuntimePolicy(staging(`${canonicalIdList(6)},${OWNER_ID}`)),
    ).toThrow(new RuntimePolicyError(ALLOWED_USERS_VARIABLE));
  });

  it("no longer reads the single owner variable", () => {
    expect(() =>
      readRuntimePolicy({
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
      }),
    ).toThrow(new RuntimePolicyError(ALLOWED_USERS_VARIABLE));
  });

  it("fails closed for an invalid mode", () => {
    expect(() =>
      readRuntimePolicy({ FITTIP_RUNTIME_MODE: "Founder-staging" }),
    ).toThrow(new RuntimePolicyError("FITTIP_RUNTIME_MODE"));
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["an empty entry", `${OWNER_ID},,${FRIEND_ID}`],
    ["a trailing comma", `${OWNER_ID},`],
    ["an upper-case UUID", "00000000-0000-4000-8000-00000000000A"],
    ["a non-UUID beside a valid one", `${OWNER_ID},owner@fittip.local`],
  ])("fails closed for a list that is %s", (_case, list) => {
    expect(() => readRuntimePolicy(staging(list))).toThrow(
      new RuntimePolicyError(ALLOWED_USERS_VARIABLE),
    );
  });

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

  it("requires the list in every Vercel environment", () => {
    expect(() =>
      readRuntimePolicy({
        VERCEL_ENV: "preview",
        FITTIP_RUNTIME_MODE: "founder-staging",
      }),
    ).toThrow(new RuntimePolicyError(ALLOWED_USERS_VARIABLE));
  });
});

describe("isAllowedVerifiedUser", () => {
  it("allows every verified user locally while admitting only the list in founder staging", () => {
    const policy = readRuntimePolicy(staging(`${OWNER_ID},${FRIEND_ID}`));

    expect(isAllowedVerifiedUser(readRuntimePolicy({}), "other-user")).toBe(
      true,
    );
    expect(isAllowedVerifiedUser(policy, OWNER_ID)).toBe(true);
    expect(isAllowedVerifiedUser(policy, FRIEND_ID)).toBe(true);
    expect(
      isAllowedVerifiedUser(policy, "00000000-0000-4000-8000-000000000003"),
    ).toBe(false);
    expect(isAllowedVerifiedUser(policy, "other-user")).toBe(false);
    expect(isAllowedVerifiedUser(policy, "")).toBe(false);
    expect(isAllowedVerifiedUser(policy, undefined)).toBe(false);
  });
});
