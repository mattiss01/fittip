import "server-only";

export type RuntimePolicy =
  | { mode: "local"; ownerUserId: null }
  | { mode: "founder-staging"; ownerUserId: string };

export class RuntimePolicyError extends Error {
  constructor(variableName: string) {
    super(`Invalid or missing ${variableName}.`);
    this.name = "RuntimePolicyError";
  }
}

const MODE_VARIABLE = "FITTIP_RUNTIME_MODE";
const OWNER_VARIABLE = "FITTIP_OWNER_USER_ID";
const FOUNDER_STAGING_MODE = "founder-staging";
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readRuntimePolicy(
  environment: Record<string, string | undefined> = process.env,
): RuntimePolicy {
  const mode = environment[MODE_VARIABLE];

  if (mode === undefined || mode === "") {
    return { mode: "local", ownerUserId: null };
  }

  if (mode !== FOUNDER_STAGING_MODE) {
    throw new RuntimePolicyError(MODE_VARIABLE);
  }

  const ownerUserId = environment[OWNER_VARIABLE];
  if (!ownerUserId || !CANONICAL_UUID_PATTERN.test(ownerUserId)) {
    throw new RuntimePolicyError(OWNER_VARIABLE);
  }

  return { mode: FOUNDER_STAGING_MODE, ownerUserId };
}

export function isAllowedVerifiedUser(
  policy: RuntimePolicy,
  verifiedUserId: unknown,
): verifiedUserId is string {
  if (typeof verifiedUserId !== "string" || verifiedUserId.length === 0) {
    return false;
  }

  return policy.mode === "local" || verifiedUserId === policy.ownerUserId;
}
