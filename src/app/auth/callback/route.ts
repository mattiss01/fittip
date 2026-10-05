import { NextResponse } from "next/server";

import { OnboardingRepository } from "@/server/repositories/onboarding-repository";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
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

  return mergeAuthResponseHeaders(
    privateRedirect(new URL(await firstDestination(client), requestUrl)),
    pending,
  );
}

/**
 * Signing up leads straight into guided setup (owner, 5 Oct 2026). This route
 * is where a new account's confirmation link lands, so it is the one moment
 * that is "just signed up": the setup draft is started here and the account
 * goes to its first step. Setup stays optional after that. It can be left or
 * cancelled, and signing in later goes to Today as before.
 *
 * Nothing here may cost the account its sign-in: if setup cannot be read, the
 * account lands on Today, and if the draft cannot be started, the setup page
 * offers to start it.
 */
async function firstDestination(
  client: ConstructorParameters<typeof OnboardingRepository>[0],
): Promise<string> {
  const onboarding = new OnboardingRepository(client);
  try {
    if ((await onboarding.getEntryState()).hasPublished) return "/home/today";
  } catch {
    return "/home/today";
  }
  try {
    await onboarding.apply({ operation: "start", expectedDraftRevision: 0 });
  } catch {
    // A draft that already exists refuses a second start; the page shows it.
  }
  return "/home/you/onboarding";
}
