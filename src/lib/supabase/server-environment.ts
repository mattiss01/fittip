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
    !isHostedSupabaseUrl(new URL(publicEnvironment.url))
  ) {
    throw new SupabaseEnvironmentError("NEXT_PUBLIC_SUPABASE_URL");
  }

  return publicEnvironment;
}

function isHostedSupabaseUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}
