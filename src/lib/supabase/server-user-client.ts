import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/supabase/database.types";
import { readSupabasePublicEnvironment } from "@/lib/supabase/env";

export async function createServerUserClient(response?: NextResponse) {
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
        setAll(cookiesToSet, headers) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
              response?.cookies.set(name, value, options);
            }
            if (headers) {
              for (const [name, value] of Object.entries(headers)) {
                response?.headers.append(name, value);
              }
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

export function privateRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export type ServerUserClient = Awaited<
  ReturnType<typeof createServerUserClient>
>;
