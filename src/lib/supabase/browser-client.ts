"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
import { readSupabasePublicEnvironment } from "@/lib/supabase/env";

export function createBrowserUserClient() {
  const environment = readSupabasePublicEnvironment();

  return createBrowserClient<Database>(
    environment.url,
    environment.publishableKey,
  );
}
