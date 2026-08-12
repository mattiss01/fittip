import "server-only";

import {
  COACH_AI_FIXTURE_LIMITS,
  COACH_AI_LIVE_LIMITS,
  type CoachAILimits,
  type CoachAIRateCard,
} from "@/server/ai/budget";
import { CoachAIError } from "@/server/ai/errors";

/**
 * The model and the price of that model, as one value.
 *
 * This module exists because of M3-01B limitation 17, and the product owner
 * accepted M3-01B on the condition that M3-02 close it. Before this, the
 * configured model and the rate card that priced it were two independent
 * constants that happened to agree: `readCode` in `enablement.ts` validated the
 * *shape* of `FITTIP_AI_MODEL` and nothing else, while `budget.ts` carried
 * `gpt-5.6-luna`'s $0.20/$1.20 per million tokens with no check that the two
 * described the same model.
 *
 * The gap was not theoretical. Setting `FITTIP_AI_MODEL=gpt-5.5` — $5.00/$30.00
 * per million — would still have computed a 5,200 micro-USD reservation against
 * a true cost near 130,000, a factor of 25. The 2,000,000 micro-USD daily
 * ceiling would then have admitted roughly $50 of real spend per day while
 * recording $2. M3-01B decision 6's "deny on an unknown price" does not catch
 * that, because the price is not unknown: it is known and wrong.
 *
 * So a binding is indivisible. There is no way to obtain a rate card here
 * except by naming a provider and model that this file pairs it with, and
 * `requireApprovedCoachAIModel` refuses anything not in the list — failing
 * closed exactly as a missing credential or a stale rate card does. The list is
 * mirrored by `public.roadmap_technical_codes_are_accepted` in the M3-02
 * migration, so a proposal recorded against an unapproved pair is refused a
 * second time at the database boundary, where the application cannot reach it.
 */

export type CoachAIModelBinding = {
  readonly providerCode: string;
  readonly modelCode: string;
  readonly rateCard: CoachAIRateCard;
  readonly limits: CoachAILimits;
  /** Whether a real provider call — and therefore real spend — is possible. */
  readonly reachesNetwork: boolean;
};

/**
 * `gpt-5.6-luna` at $0.20 / $1.20 per million input / output tokens, read on
 * 10 August 2026 (M3-01B decision 1 and decision 6).
 *
 * The rate card is a constant in this repository, versioned and updated by
 * deploy, never fetched at runtime — a price lookup that can fail is one more
 * thing between the owner and a proposal. Past `validUntil` the price is stale,
 * stale is unknown, and unknown denies, because a wrong price near a hard
 * ceiling is worse than no proposal.
 *
 * Against `COACH_AI_LIVE_LIMITS` a reservation charges 10,000 x 200,000/1e6
 * plus 3,000 x 1,200,000/1e6 = 5,600 micro-USD, inside the 8,000 per-request
 * ceiling with headroom.
 */
const OPENAI_GPT_5_6_LUNA: CoachAIModelBinding = {
  providerCode: "openai",
  modelCode: "gpt-5.6-luna",
  rateCard: {
    version: "openai-gpt-5.6-luna-2026-08-10",
    currency: "USD",
    inputMicroUsdPerMillionTokens: 200_000,
    outputMicroUsdPerMillionTokens: 1_200_000,
    validUntil: "2027-02-01T00:00:00.000Z",
  },
  limits: COACH_AI_LIVE_LIMITS,
  reachesNetwork: true,
};

/**
 * The fixture corpus. It reaches nothing and spends nothing, so its rate card
 * is zero — and because it is a binding like any other, a fixture run cannot
 * borrow the live price, and a live run cannot borrow the fixture's.
 */
export const FIXTURE_COACH_AI_BINDING: CoachAIModelBinding = {
  providerCode: "fixture",
  modelCode: "fixture-corpus-v1",
  rateCard: {
    version: "fixture-no-spend",
    currency: "USD",
    inputMicroUsdPerMillionTokens: 0,
    outputMicroUsdPerMillionTokens: 0,
    // Far out, and deliberately not "never": an expiry that cannot arrive is an
    // expiry nobody notices has stopped meaning anything.
    validUntil: "2030-01-01T00:00:00.000Z",
  },
  limits: COACH_AI_FIXTURE_LIMITS,
  reachesNetwork: false,
};

/**
 * Every provider/model pair FitTip may call, with its price. Adding one is a
 * product-owner decision about spend, not a convenience.
 */
export const APPROVED_COACH_AI_MODELS: readonly CoachAIModelBinding[] = [
  OPENAI_GPT_5_6_LUNA,
  FIXTURE_COACH_AI_BINDING,
];

/**
 * Resolves a configured provider/model pair to the binding that prices it, or
 * refuses.
 *
 * `provider_unconfigured` is the right code for a mismatch and not an accident:
 * a deployment whose model is not one this repository can price *is*
 * unconfigured, and the message is the same one a missing provider gets, so a
 * caller learns nothing about which part of the configuration is wrong.
 */
export function requireApprovedCoachAIModel(
  providerCode: string,
  modelCode: string,
): CoachAIModelBinding {
  const binding = APPROVED_COACH_AI_MODELS.find(
    (candidate) =>
      candidate.providerCode === providerCode &&
      candidate.modelCode === modelCode,
  );

  if (!binding) throw new CoachAIError("provider_unconfigured");
  return binding;
}

/**
 * The live bindings only. A composition root that has passed the enablement
 * gate must resolve to one of these; resolving to the fixture binding would
 * mean a real call priced at zero.
 */
export function requireLiveCoachAIModel(
  providerCode: string,
  modelCode: string,
): CoachAIModelBinding {
  const binding = requireApprovedCoachAIModel(providerCode, modelCode);
  if (!binding.reachesNetwork) throw new CoachAIError("provider_unconfigured");
  return binding;
}
