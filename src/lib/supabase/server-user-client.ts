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
                response?.headers.set(name, value);
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
  return applyPrivateSessionHeaders(response);
}

export function applyPrivateSessionHeaders<T extends NextResponse>(
  response: T,
): T {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function mergeAuthResponseHeaders(
  response: NextResponse,
  accumulator: NextResponse,
): NextResponse {
  for (const cookie of accumulator.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }

  for (const [name, value] of accumulator.headers.entries()) {
    if (
      name.toLowerCase() !== "set-cookie" &&
      !["cache-control", "expires", "pragma"].includes(name.toLowerCase())
    ) {
      response.headers.set(name, value);
    }
  }

  return applyPrivateSessionHeaders(response);
}

export type ServerUserClient = Awaited<
  ReturnType<typeof createServerUserClient>
>;
