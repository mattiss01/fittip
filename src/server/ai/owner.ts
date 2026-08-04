import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database } from "@/lib/supabase/database.types";
import { CoachAIError } from "@/server/ai/errors";

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

type ClaimsClient = Pick<SupabaseClient<Database>, "auth">;

/**
 * Anonymous callers, callers outside the accepted runtime allowlist, and any
 * claims failure all collapse to the same denial. The reason is deliberately
 * not distinguished for the caller; it is separately visible in telemetry as a
 * coarse gate code.
 */
export async function verifyCoachAIOwner(
  client: ClaimsClient,
): Promise<CoachAIOwner> {
  try {
    const id = await requireAllowedVerifiedUser(client);
    return { id } as unknown as CoachAIOwner;
  } catch (error) {
    if (error instanceof VerifiedUserAccessError) {
      throw new CoachAIError("owner_denied");
    }
    throw new CoachAIError("owner_denied");
  }
}
