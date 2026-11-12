import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  isAllowedVerifiedUser,
  readRuntimePolicy,
  type RuntimePolicy,
} from "@/lib/auth/runtime-policy";

type ClaimsClient = Pick<SupabaseClient<Database>, "auth">;

export class VerifiedUserAccessError extends Error {
  /**
   * `"not-owner"` means a verified user outside `FITTIP_ALLOWED_USER_IDS`. The
   * name predates the friends beta (ADR-043) and is kept because every `/home`
   * page matches on it; it reads "not admitted".
   */
  constructor(
    readonly policy: RuntimePolicy,
    readonly reason: "anonymous" | "not-owner",
  ) {
    super("A permitted FitTip user is required.");
    this.name = "VerifiedUserAccessError";
  }
}

export async function requireAllowedVerifiedUser(
  client: ClaimsClient,
  policy = readRuntimePolicy(),
): Promise<string> {
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;

  if (error || typeof userId !== "string" || userId.length === 0) {
    throw new VerifiedUserAccessError(policy, "anonymous");
  }

  if (!isAllowedVerifiedUser(policy, userId)) {
    throw new VerifiedUserAccessError(policy, "not-owner");
  }

  return userId;
}
