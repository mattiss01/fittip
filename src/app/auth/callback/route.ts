import { NextResponse } from "next/server";

import { OnboardingRepository } from "@/server/repositories/onboarding-repository";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const pending = new NextResponse();
  const failed = () =>
    mergeAuthResponseHeaders(
      privateRedirect(new URL("/?auth=confirmation-failed", requestUrl)),
      pending,
    );

  if (!code) {
    return failed();
  }

  const client = await createServerUserClient(pending);
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    return failed();
  }

  try {
    await requireAllowedVerifiedUser(client);
    const profiles = new ProfileRepository(client);
    await profiles.ensureCurrentProfile();
  } catch {
    await client.auth.signOut();
    return failed();
  }

  await startSetup(client);

  // The link confirms the account; it does not sign it in (owner, 5 Oct
  // 2026). The session this route needed to confirm with is ended, and the
  // account signs in on the page it lands on, which says it is confirmed.
  await client.auth.signOut();
  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/?auth=confirmed", requestUrl)),
    pending,
  );
}

/**
 * Signing up leads straight into guided setup (owner, 5 Oct 2026). This route
 * is where a new account's confirmation link lands, so it is the one moment
 * that is "just signed up": the setup draft is started here, and the sign-in
 * that follows opens it while nothing in it has been saved (see the sign-in
 * route). Setup stays optional: it can be left or cancelled.
 *
 * Nothing here may cost the account its confirmation: if setup cannot be read
 * or started, the account still confirms, signs in and lands on Today, and
 * setup is reached from You.
 */
async function startSetup(client: ServerUserClient): Promise<void> {
  const onboarding = new OnboardingRepository(client);
  try {
    if ((await onboarding.getEntryState()).hasPublished) return;
    await onboarding.apply({ operation: "start", expectedDraftRevision: 0 });
  } catch {
    // A draft that has been worked on refuses a second start, and it is
    // then the owner's to come back to.
  }
}
