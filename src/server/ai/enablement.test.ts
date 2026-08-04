import { describe, expect, it } from "vitest";

import { CoachAIError } from "@/server/ai/errors";
import {
  hasPublicAIVariable,
  requireCoachAILiveEnablement,
  resolveCoachAIEnvironment,
} from "@/server/ai/enablement";

const OWNER = "53000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "53000000-0000-4000-8000-000000000002";
const CREDENTIAL = "not-a-real-key-0000000000000000";

/** Every control agreeing, in the approved local runtime. */
const LOCAL: Record<string, string | undefined> = {
  FITTIP_AI_LIVE: "enabled",
  FITTIP_AI_OWNER_ALLOWLIST: OWNER,
  FITTIP_AI_OPERATIONS: "create_roadmap,create_seven_day_plan",
  FITTIP_AI_PROVIDER: "example-provider",
  FITTIP_AI_MODEL: "example-model-1",
  FITTIP_AI_API_KEY: CREDENTIAL,
};

/** The same, in the M0-06A founder project. */
const FOUNDER: Record<string, string | undefined> = {
  ...LOCAL,
  FITTIP_RUNTIME_MODE: "founder-staging",
  FITTIP_OWNER_USER_ID: OWNER,
  VERCEL: "1",
  VERCEL_ENV: "production",
};

function enable(
  environment: Record<string, string | undefined>,
  ownerId = OWNER,
  operation: unknown = "create_roadmap",
) {
  return requireCoachAILiveEnablement({ operation, ownerId, environment });
}

function denialCode(
  environment: Record<string, string | undefined>,
  ownerId = OWNER,
  operation: unknown = "create_roadmap",
): string {
  try {
    enable(environment, ownerId, operation);
  } catch (error) {
    if (error instanceof CoachAIError) return error.code;
    throw error;
  }
  throw new Error("expected the live enablement gate to deny");
}

describe("live enablement gate", () => {
  it("permits a call only when every control agrees", () => {
    expect(enable(LOCAL)).toEqual({
      environment: "local",
      ownerId: OWNER,
      operation: "create_roadmap",
      providerCode: "example-provider",
      modelCode: "example-model-1",
    });

    expect(enable(FOUNDER).environment).toBe("founder-staging");
  });

  it("never returns the credential it checked for", () => {
    expect(JSON.stringify(enable(LOCAL))).not.toContain(CREDENTIAL);
  });

  it.each<[string, Record<string, string | undefined>, string]>([
    ["no live flag", omit(LOCAL, "FITTIP_AI_LIVE"), "not_enabled"],
    ["a blank live flag", { ...LOCAL, FITTIP_AI_LIVE: "" }, "not_enabled"],
    [
      "a near-miss live flag",
      { ...LOCAL, FITTIP_AI_LIVE: "true" },
      "not_enabled",
    ],
    ["a Vercel Preview", { ...FOUNDER, VERCEL_ENV: "preview" }, "not_enabled"],
    [
      "a Vercel development runtime",
      { ...FOUNDER, VERCEL_ENV: "development" },
      "not_enabled",
    ],
    [
      "a hosted runtime with no declared mode",
      omit(FOUNDER, "FITTIP_RUNTIME_MODE"),
      "not_enabled",
    ],
    [
      "an unknown runtime mode",
      { ...FOUNDER, FITTIP_RUNTIME_MODE: "staging" },
      "not_enabled",
    ],
    [
      "a publicly exposed AI variable",
      { ...LOCAL, NEXT_PUBLIC_FITTIP_AI_KEY: "leaked" },
      "not_enabled",
    ],
    [
      "no owner allowlist",
      omit(LOCAL, "FITTIP_AI_OWNER_ALLOWLIST"),
      "owner_denied",
    ],
    [
      "an empty owner allowlist",
      { ...LOCAL, FITTIP_AI_OWNER_ALLOWLIST: " , " },
      "owner_denied",
    ],
    [
      "a malformed allowlist entry",
      { ...LOCAL, FITTIP_AI_OWNER_ALLOWLIST: `${OWNER},everyone` },
      "owner_denied",
    ],
    [
      "no enabled operations",
      omit(LOCAL, "FITTIP_AI_OPERATIONS"),
      "operation_disabled",
    ],
    [
      "an operation that is switched off",
      { ...LOCAL, FITTIP_AI_OPERATIONS: "create_seven_day_plan" },
      "operation_disabled",
    ],
    [
      "an unrecognized operation in the list",
      { ...LOCAL, FITTIP_AI_OPERATIONS: "create_roadmap,rewrite_history" },
      "operation_disabled",
    ],
    ["no provider", omit(LOCAL, "FITTIP_AI_PROVIDER"), "provider_unconfigured"],
    ["no model", omit(LOCAL, "FITTIP_AI_MODEL"), "provider_unconfigured"],
    [
      "a malformed provider code",
      { ...LOCAL, FITTIP_AI_PROVIDER: "provider name!" },
      "provider_unconfigured",
    ],
    [
      "no credential",
      omit(LOCAL, "FITTIP_AI_API_KEY"),
      "credential_unavailable",
    ],
    [
      "a placeholder credential",
      { ...LOCAL, FITTIP_AI_API_KEY: "todo" },
      "credential_unavailable",
    ],
    [
      "a credential with stray whitespace",
      { ...LOCAL, FITTIP_AI_API_KEY: ` ${CREDENTIAL} ` },
      "credential_unavailable",
    ],
  ])("denies with %s", (_case, environment, code) => {
    expect(denialCode(environment)).toBe(code);
  });

  it("denies an owner outside the allowlist", () => {
    expect(denialCode(LOCAL, OTHER_OWNER)).toBe("owner_denied");
  });

  it.each(["", "anonymous", "53000000-0000-4000-8000"])(
    "denies the unverifiable owner id %s",
    (ownerId) => {
      expect(denialCode(LOCAL, ownerId)).toBe("owner_denied");
    },
  );

  it("rejects an operation the boundary does not define", () => {
    expect(denialCode(LOCAL, OWNER, "delete_everything")).toBe("invalid_input");
    expect(denialCode(LOCAL, OWNER, null)).toBe("invalid_input");
    expect(denialCode(LOCAL, OWNER, { operation: "create_roadmap" })).toBe(
      "invalid_input",
    );
  });

  it("resolves no environment for an unapproved runtime", () => {
    expect(
      resolveCoachAIEnvironment(
        { VERCEL_ENV: "preview" },
        { mode: "founder-staging", ownerUserId: OWNER },
      ),
    ).toBeNull();
    expect(
      resolveCoachAIEnvironment(
        { VERCEL_ENV: "production" },
        { mode: "local", ownerUserId: null },
      ),
    ).toBeNull();
  });

  it("spots a publicly exposed AI variable by name", () => {
    expect(hasPublicAIVariable({ NEXT_PUBLIC_AI_MODEL: "x" })).toBe(true);
    expect(hasPublicAIVariable({ NEXT_PUBLIC_FITTIP_AI: "x" })).toBe(true);
    expect(hasPublicAIVariable({ NEXT_PUBLIC_SUPABASE_URL: "x" })).toBe(false);
    expect(hasPublicAIVariable({ FITTIP_AI_API_KEY: "x" })).toBe(false);
  });
});

function omit(
  environment: Record<string, string | undefined>,
  key: string,
): Record<string, string | undefined> {
  const copy = { ...environment };
  delete copy[key];
  return copy;
}
