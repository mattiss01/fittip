import { NextResponse } from "next/server";

import { readRuntimePolicy } from "@/lib/auth/runtime-policy";
import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
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
  try {
    await requireAllowedVerifiedUser(client);
  } catch (error) {
    if (
      error instanceof VerifiedUserAccessError &&
      error.reason === "not-owner"
    ) {
      await client.auth.signOut({ scope: "local" });
    }
  }

  return mergeAuthResponseHeaders(fallback(), pending);
}
