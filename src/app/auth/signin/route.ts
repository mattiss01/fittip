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
  let returnTo = safeAuthReturn(formData.get("next"));
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!error) {
    const profiles = new ProfileRepository(client);
    let firstSignIn = false;
    try {
      await requireAllowedVerifiedUser(client);
      // An account that signed up here was sent a confirmation mail, which
      // Auth records and the account cannot change. One made for it another
      // way (a test's, or the local owner's) was not, and goes where signing
      // in always went.
      firstSignIn =
        (await profiles.getCurrentProfile()) === null &&
        Boolean((await client.auth.getUser()).data.user?.confirmation_sent_at);
      await profiles.ensureCurrentProfile();
    } catch {
      await client.auth.signOut();
      return mergeAuthResponseHeaders(
        privateRedirect(new URL("/?error=credentials", request.url)),
        pending,
      );
    }

    // Guided setup that is waiting comes before anything else (owner, 5 Oct
    // 2026). A new account's confirmation began it and signed the account
    // out again, so this is where it opens. Once the owner has chosen
    // "Continue later", it no longer opens by itself: the same page asks
    // whether to go on with it or skip. A finished setup, and an account
    // whose setup was never begun, go where signing in always went. Both
    // destinations are constants, and failing to read the state never costs
    // the sign-in.
    //
    // A confirmation link opened in another browser confirms the account
    // without reaching our callback, so nothing was begun for it. Such an
    // account signed up here and has no profile until this sign-in makes
    // one, and that is how it is told from an older account that never ran
    // setup: its setup is begun here instead.
    try {
      if (firstSignIn) await profiles.startSetup();
      const setup = await profiles.getSetupState();
      if (!setup.finished && setup.step !== null) {
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
