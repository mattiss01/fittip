import "server-only";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { ServerUserClient } from "@/lib/supabase/server-user-client";
import { CoachAIError } from "@/server/ai/errors";
import { Consents } from "@/server/repositories/consent-repository";

declare const coachAIOwnerBrand: unique symbol;

/**
 * A verified owner id. The brand is unforgeable outside this module, so a
 * caller cannot hand the coaching service a `user_id` it chose: the only way to
 * obtain one is `verifyCoachAIOwner`, which reads verified Auth claims.
 */
export type CoachAIOwner = {
  readonly id: string;
  readonly [coachAIOwnerBrand]: true;
};

/**
 * Anonymous callers, callers outside the accepted runtime allowlist, and any
 * claims failure all collapse to the same denial. The reason is deliberately
 * not distinguished for the caller; it is separately visible in telemetry as a
 * coarse gate code.
 *
 * Since B2 (ADR-043 decision 5) an admitted person is an owner for the coach
 * only once their decision in force agrees to the current notice, in fixture
 * and live mode alike. Every coach action obtains its owner here, so this is
 * the one place that refusal is made; `reserve_ai_spend` repeats it in the
 * database for every live call.
 */
export async function verifyCoachAIOwner(
  client: ServerUserClient,
): Promise<CoachAIOwner> {
  let id: string;
  try {
    id = await requireAllowedVerifiedUser(client);
  } catch (error) {
    if (error instanceof VerifiedUserAccessError) {
      throw new CoachAIError("owner_denied");
    }
    throw new CoachAIError("owner_denied");
  }

  let consent;
  try {
    consent = await new Consents(client).current("coach");
  } catch {
    // An unreadable decision is no agreement.
    throw new CoachAIError("consent_required");
  }
  if (consent.status !== "agreed") {
    throw new CoachAIError("consent_required");
  }

  return { id } as unknown as CoachAIOwner;
}
