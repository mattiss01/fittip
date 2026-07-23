import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";
import { readSupabasePublicEnvironment } from "@/lib/supabase/env";

export async function createServerUserClient() {
  const cookieStore = await cookies();
  const environment = readSupabasePublicEnvironment();

  return createServerClient<Database>(
    environment.url,
    environment.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. M0-03 will add the
            // approved request proxy that owns refresh-cookie writes.
          }
        },
      },
    },
  );
}

export type ServerUserClient = Awaited<
  ReturnType<typeof createServerUserClient>
>;
