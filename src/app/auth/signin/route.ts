import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { safeAuthReturn } from "@/lib/auth/safe-return";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = safeAuthReturn(formData.get("next"));
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!error) {
    try {
      await requireAllowedVerifiedUser(client);
      await new ProfileRepository(client).ensureCurrentProfile();
    } catch {
      await client.auth.signOut();
      return mergeAuthResponseHeaders(
        privateRedirect(new URL("/?error=credentials", request.url)),
        pending,
      );
    }
  }

  return mergeAuthResponseHeaders(
    privateRedirect(
      new URL(error ? "/?error=credentials" : returnTo, request.url),
    ),
    pending,
  );
}
