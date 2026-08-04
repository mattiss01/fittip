import "server-only";

import {
  readRuntimePolicy,
  type RuntimePolicy,
} from "@/lib/auth/runtime-policy";
import {
  isCoachAIOperation,
  type CoachAIEnvironment,
  type CoachAIOperation,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";

/**
 * The gate that must pass before any real provider is invoked. It is written
 * deny-by-default: every check names the exact value it admits, and a missing,
 * blank, malformed, or unexpected value denies.
 *
 * M3-01 ships no provider, so nothing in the repository can satisfy this gate
 * end to end. It exists and is tested now precisely so it cannot be written
 * under the pressure of shipping a provider.
 */

const LIVE_FLAG_VARIABLE = "FITTIP_AI_LIVE";
const OWNER_ALLOWLIST_VARIABLE = "FITTIP_AI_OWNER_ALLOWLIST";
const OPERATIONS_VARIABLE = "FITTIP_AI_OPERATIONS";
const PROVIDER_VARIABLE = "FITTIP_AI_PROVIDER";
const MODEL_VARIABLE = "FITTIP_AI_MODEL";
/**
 * Read for presence only. Its value is never returned, logged, compared to a
 * literal, or placed in a request, error, or telemetry record.
 */
const CREDENTIAL_VARIABLE = "FITTIP_AI_API_KEY";

const ENABLED_VALUE = "enabled";
const MINIMUM_CREDENTIAL_LENGTH = 20;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type CoachAILiveEnablement = {
  environment: CoachAIEnvironment;
  ownerId: string;
  operation: CoachAIOperation;
  providerCode: string;
  modelCode: string;
};

export type CoachAIEnablementInput = {
  operation: unknown;
  ownerId: string;
  environment?: Record<string, string | undefined>;
  policy?: RuntimePolicy;
};

/**
 * Maps the accepted runtime policy onto the two environments a live call is
 * permitted from. A Vercel Preview or `vercel dev` runtime resolves to `null`
 * even when every other control agrees: M0-06A's founder project is the
 * `production` target, and nothing else hosted is approved.
 */
export function resolveCoachAIEnvironment(
  environment: Record<string, string | undefined>,
  policy: RuntimePolicy,
): CoachAIEnvironment | null {
  const vercelEnvironment = environment.VERCEL_ENV?.trim();

  if (policy.mode === "local") {
    return vercelEnvironment ? null : "local";
  }

  if (policy.mode === "founder-staging") {
    return vercelEnvironment === "production" ? "founder-staging" : null;
  }

  return null;
}

export function requireCoachAILiveEnablement(
  input: CoachAIEnablementInput,
): CoachAILiveEnablement {
  const environment = input.environment ?? process.env;
  const operation = input.operation;

  if (!isCoachAIOperation(operation)) {
    throw new CoachAIError("invalid_input");
  }

  if (!CANONICAL_UUID_PATTERN.test(input.ownerId)) {
    throw new CoachAIError("owner_denied");
  }

  let policy: RuntimePolicy;
  try {
    policy = input.policy ?? readRuntimePolicy(environment);
  } catch {
    // An unreadable runtime policy is an ambiguous environment, and an
    // ambiguous environment never calls out.
    throw new CoachAIError("not_enabled");
  }

  const resolved = resolveCoachAIEnvironment(environment, policy);
  if (!resolved) {
    throw new CoachAIError("not_enabled");
  }

  if (environment[LIVE_FLAG_VARIABLE]?.trim() !== ENABLED_VALUE) {
    throw new CoachAIError("not_enabled");
  }

  // A publicly exposed AI variable means a key or its configuration can reach
  // the browser bundle. That is a leak whether or not this call would succeed.
  if (hasPublicAIVariable(environment)) {
    throw new CoachAIError("not_enabled");
  }

  const allowlist = readList(environment[OWNER_ALLOWLIST_VARIABLE]);
  if (
    allowlist.length === 0 ||
    !allowlist.every((entry) => CANONICAL_UUID_PATTERN.test(entry)) ||
    !allowlist.includes(input.ownerId)
  ) {
    throw new CoachAIError("owner_denied");
  }

  const operations = readList(environment[OPERATIONS_VARIABLE]);
  if (
    operations.length === 0 ||
    !operations.every(isCoachAIOperation) ||
    !operations.includes(operation)
  ) {
    throw new CoachAIError("operation_disabled");
  }

  const providerCode = readCode(environment[PROVIDER_VARIABLE]);
  const modelCode = readCode(environment[MODEL_VARIABLE]);
  if (!providerCode || !modelCode) {
    throw new CoachAIError("provider_unconfigured");
  }

  // Presence, shape, and length only. The value is not returned or retained.
  const credential = environment[CREDENTIAL_VARIABLE];
  if (
    typeof credential !== "string" ||
    credential.trim().length < MINIMUM_CREDENTIAL_LENGTH ||
    credential.trim() !== credential
  ) {
    throw new CoachAIError("credential_unavailable");
  }

  return {
    environment: resolved,
    ownerId: input.ownerId,
    operation,
    providerCode,
    modelCode,
  };
}

/**
 * Any `NEXT_PUBLIC_*` variable naming AI. Next.js inlines those into client
 * code, so their mere existence means the boundary has already been crossed.
 */
export function hasPublicAIVariable(
  environment: Record<string, string | undefined>,
): boolean {
  return Object.keys(environment).some(
    (key) =>
      key.startsWith("NEXT_PUBLIC_") &&
      /(^|_)AI(_|$)/.test(key.slice("NEXT_PUBLIC_".length)),
  );
}

function readList(value: string | undefined): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readCode(value: string | undefined): string | null {
  const clean = value?.trim().toLowerCase();
  return clean && CODE_PATTERN.test(clean) ? clean : null;
}
