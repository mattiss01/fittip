import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
import { readSupabasePublicEnvironment } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
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
              response.headers.append(name, value);
            }
          }
        },
      },
    },
  );

  const { data, error } = await client.auth.getClaims();
  if (
    request.nextUrl.pathname.startsWith("/home") &&
    (error || !data?.claims.sub)
  ) {
    const redirect = NextResponse.redirect(new URL("/", request.url), 303);
    response.headers.forEach((value, name) =>
      redirect.headers.append(name, value),
    );
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/home/:path*"],
};
