import "server-only";

export type RuntimePolicy =
  | { mode: "local"; allowedUserIds: null }
  | { mode: "founder-staging"; allowedUserIds: readonly string[] };

export class RuntimePolicyError extends Error {
  constructor(variableName: string) {
    super(`Invalid or missing ${variableName}.`);
    this.name = "RuntimePolicyError";
  }
}

const MODE_VARIABLE = "FITTIP_RUNTIME_MODE";
/**
 * The verified Auth user ids admitted to a hosted runtime, comma-separated:
 * the owner and the friends of the beta (ADR-043). It replaced the single
 * `FITTIP_OWNER_USER_ID` on 12 November 2026, which is no longer read.
 */
const ALLOWED_USERS_VARIABLE = "FITTIP_ALLOWED_USER_IDS";
const FOUNDER_STAGING_MODE = "founder-staging";
/** The owner and at most five friends (ADR-043 decision 1). */
const MAXIMUM_ALLOWED_USERS = 6;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readRuntimePolicy(
  environment: Record<string, string | undefined> = process.env,
): RuntimePolicy {
  const mode = environment[MODE_VARIABLE];

  if ((mode === undefined || mode === "") && !isVercelRuntime(environment)) {
    return { mode: "local", allowedUserIds: null };
  }

  if (mode !== FOUNDER_STAGING_MODE) {
    throw new RuntimePolicyError(MODE_VARIABLE);
  }

  const allowedUserIds = readAllowedUserIds(
    environment[ALLOWED_USERS_VARIABLE],
  );
  if (!allowedUserIds) {
    throw new RuntimePolicyError(ALLOWED_USERS_VARIABLE);
  }

  return { mode: FOUNDER_STAGING_MODE, allowedUserIds };
}

/**
 * The whole list or nothing: one blank, malformed or surplus entry refuses
 * the list, so a typo locks the runtime rather than admitting a guess.
 */
function readAllowedUserIds(
  value: string | undefined,
): readonly string[] | null {
  if (!value || value.trim() === "") return null;

  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length > MAXIMUM_ALLOWED_USERS) return null;
  if (!entries.every((entry) => CANONICAL_UUID_PATTERN.test(entry))) {
    return null;
  }

  return Object.freeze([...new Set(entries)]);
}

function isVercelRuntime(
  environment: Record<string, string | undefined>,
): boolean {
  return environment.VERCEL === "1" || Boolean(environment.VERCEL_ENV);
}

export function isAllowedVerifiedUser(
  policy: RuntimePolicy,
  verifiedUserId: unknown,
): verifiedUserId is string {
  if (typeof verifiedUserId !== "string" || verifiedUserId.length === 0) {
    return false;
  }

  return (
    policy.mode === "local" || policy.allowedUserIds.includes(verifiedUserId)
  );
}
