import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
import {
  isAllowedVerifiedUser,
  readRuntimePolicy,
} from "@/lib/auth/runtime-policy";
import { readSupabasePublicEnvironment } from "@/lib/supabase/env";
import {
  applyPrivateSessionHeaders,
  mergeAuthResponseHeaders,
} from "@/lib/supabase/server-user-client";

export async function proxy(request: NextRequest) {
  const policy = readRuntimePolicy();
  const pathname = request.nextUrl.pathname;

  if (pathname === "/signup" && policy.mode === "founder-staging") {
    return applyPrivateSessionHeaders(
      NextResponse.redirect(new URL("/", request.url), 303),
    );
  }

  let response = NextResponse.next({ request });
  const environment = readSupabasePublicEnvironment();
  const client = createServerClient<Database>(
    environment.url,
    environment.publishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          if (headers) {
            for (const [name, value] of Object.entries(headers)) {
              response.headers.set(name, value);
            }
          }
        },
      },
    },
  );

  const { data, error } = await client.auth.getClaims();
  if (
    pathname.startsWith("/home") &&
    (error || !isAllowedVerifiedUser(policy, data?.claims.sub))
  ) {
    await client.auth.signOut();
    const redirect = NextResponse.redirect(new URL("/", request.url), 303);
    return mergeAuthResponseHeaders(redirect, response);
  }

  return applyPrivateSessionHeaders(response);
}

export const config = {
  matcher: ["/home/:path*", "/signup"],
};
