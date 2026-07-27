import "server-only";

import { readRuntimePolicy } from "@/lib/auth/runtime-policy";
import {
  readSupabasePublicEnvironment,
  SupabaseEnvironmentError,
  type SupabasePublicEnvironment,
} from "@/lib/supabase/env";

export function readServerSupabaseEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SupabasePublicEnvironment {
  const policy = readRuntimePolicy(environment);
  const publicEnvironment = readSupabasePublicEnvironment(environment);

  if (
    policy.mode === "founder-staging" &&
    !isFounderStagingSupabaseOrigin(publicEnvironment.url)
  ) {
    throw new SupabaseEnvironmentError("NEXT_PUBLIC_SUPABASE_URL");
  }

  return publicEnvironment;
}

const FOUNDER_STAGING_SUPABASE_ORIGIN =
  /^https:\/\/[a-z]{20}\.supabase\.co\/?$/;

function isFounderStagingSupabaseOrigin(value: string): boolean {
  return FOUNDER_STAGING_SUPABASE_ORIGIN.test(value);
}
