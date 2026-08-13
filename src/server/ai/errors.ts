import "server-only";

/**
 * Every way a coaching request can stop, as a stable code. A caller maps a code
 * to a screen state; it never sees a provider body, prompt, credential state,
 * header, or raw error.
 */
export const COACH_AI_ERROR_CODES = [
  "invalid_input",
  "owner_denied",
  "not_enabled",
  "operation_disabled",
  "provider_unconfigured",
  "credential_unavailable",
  "context_invalid",
  "context_below_minimum",
  "context_too_large",
  "rate_limited",
  "concurrency_limited",
  "budget_unavailable",
  "budget_exhausted",
  "idempotency_conflict",
  "deadline_exceeded",
  "provider_unavailable",
  "output_invalid",
] as const;

export type CoachAIErrorCode = (typeof COACH_AI_ERROR_CODES)[number];

/**
 * User-safe copy. It names no provider, no configuration state, no budget
 * figure, and no other user, and it never implies that something was saved.
 * Missing configuration and a missing credential deliberately share one
 * message: telling a caller which one is absent describes the secret boundary.
 */
const SAFE_MESSAGES: Record<CoachAIErrorCode, string> = {
  invalid_input: "That coaching request could not be understood.",
  owner_denied: "Coaching suggestions are not available for this account.",
  not_enabled: "Coaching suggestions are turned off.",
  operation_disabled: "That coaching suggestion is turned off.",
  provider_unconfigured: "Coaching suggestions are unavailable.",
  credential_unavailable: "Coaching suggestions are unavailable.",
  context_invalid: "Your goals and memory could not be prepared for this.",
  // M3-03 decision 5. Not a safety failure and not an error the owner caused:
  // it says the coach has nothing to work from, in those terms. The caller
  // names exactly what is missing from the error's `missing` list rather than
  // from this sentence, which stays free of owner content.
  context_below_minimum:
    "There is not enough set up yet for the coach to plan from.",
  context_too_large: "There is too much to consider for one suggestion.",
  rate_limited: "The suggestion limit has been reached. Try again later.",
  concurrency_limited: "A suggestion is already being prepared.",
  budget_unavailable: "Coaching suggestions are temporarily unavailable.",
  budget_exhausted: "The suggestion limit has been reached.",
  idempotency_conflict: "Your goals or memory changed while this was prepared.",
  deadline_exceeded: "Coaching suggestions are temporarily unavailable.",
  provider_unavailable: "Coaching suggestions are temporarily unavailable.",
  output_invalid: "The suggestion failed its checks and was discarded.",
};

export class CoachAIError extends Error {
  constructor(readonly code: CoachAIErrorCode) {
    // The message is drawn from a fixed table, so no user content, provider
    // text, or configuration value can ever reach it.
    super(SAFE_MESSAGES[code]);
    this.name = "CoachAIError";
  }
}

export function isCoachAIError(value: unknown): value is CoachAIError {
  return value instanceof CoachAIError;
}
