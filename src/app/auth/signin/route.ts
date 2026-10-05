import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import { OnboardingRepository } from "@/server/repositories/onboarding-repository";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { safeAuthReturn } from "@/lib/auth/safe-return";

export async function POST(request: Request) {
  const formData = await request.formData();
  let returnTo = safeAuthReturn(formData.get("next"));
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

    // A new account's confirmation started guided setup and signed it out
    // again, so this is where it opens (owner, 5 Oct 2026). Only while
    // nothing in it has been saved: once the owner has worked on it, or
    // cancelled it, signing in goes where it always did. The destination is
    // a constant, and failing to read the draft never costs the sign-in.
    try {
      if (await new OnboardingRepository(client).hasUntouchedDraft()) {
        returnTo = "/home/you/onboarding";
      }
    } catch {
      // Setup is optional and reached from You.
    }
  }

  return mergeAuthResponseHeaders(
    privateRedirect(
      new URL(error ? "/?error=credentials" : returnTo, request.url),
    ),
    pending,
  );
}
