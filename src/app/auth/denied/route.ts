import { NextResponse } from "next/server";

import { readRuntimePolicy } from "@/lib/auth/runtime-policy";
import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const fallback = () =>
    privateRedirect(new URL("/?error=credentials", requestUrl));

  if (readRuntimePolicy().mode !== "founder-staging") {
    return fallback();
  }

  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  await client.auth.signOut();

  return mergeAuthResponseHeaders(fallback(), pending);
}
