import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { safeAuthReturn } from "@/lib/auth/safe-return";
import { COACH_CONSENT_LATER_COOKIE } from "@/lib/coach-consent-cookie";

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
      // Auth records and the account cannot change. On the hosted app every
      // other account is a friend's, made by hand by the owner (ADR-043
      // decision 3), and is new to FitTip in the same way (owner, 20 Nov
      // 2026). Locally, one made another way (a test's, or the local
      // owner's) goes where signing in always went.
      firstSignIn =
        (await profiles.getCurrentProfile()) === null &&
        (readRuntimePolicy().mode === "founder-staging" ||
          Boolean(
            (await client.auth.getUser()).data.user?.confirmation_sent_at,
          ));
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

    // A ✕ on the coach dialog lasts until the next sign-in, which is this
    // one (owner, 12 Nov 2026; ADR-043 decision 5). Cleared only when sent,
    // so an ordinary sign-in carries no extra cookie.
    const sent = request.headers.get("cookie") ?? "";
    if (
      sent
        .split(";")
        .some((part) =>
          part.trim().startsWith(`${COACH_CONSENT_LATER_COOKIE}=`),
        )
    ) {
      pending.cookies.delete(COACH_CONSENT_LATER_COOKIE);
    }
  }

  return mergeAuthResponseHeaders(
    privateRedirect(
      new URL(error ? "/?error=credentials" : returnTo, request.url),
    ),
    pending,
  );
}
