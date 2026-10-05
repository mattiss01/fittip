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

    // Guided setup that is waiting comes before anything else (owner, 5 Oct
    // 2026). A new account's confirmation started it and signed the account
    // out again, so this is where it opens. Once the owner has chosen
    // "Continue later", it no longer opens by itself: the same page asks
    // whether to go on with it or skip. A finished setup, and an account with
    // no draft, go where signing in always went. Both destinations are
    // constants, and failing to read the state never costs the sign-in.
    try {
      const setup = await new OnboardingRepository(client).getSetupState();
      if (!setup.published && setup.hasDraft) {
        returnTo = setup.skipped
          ? "/home/you/onboarding?remind=1"
          : "/home/you/onboarding";
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
