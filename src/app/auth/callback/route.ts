import { NextResponse } from "next/server";

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

  const profiles = new ProfileRepository(client);
  try {
    await requireAllowedVerifiedUser(client);
    await profiles.ensureCurrentProfile();
  } catch {
    await client.auth.signOut();
    return failed();
  }

  await startSetup(profiles);

  // The link confirms the account; it does not sign it in (owner, 5 Oct
  // 2026). The session this route needed to confirm with is ended, and the
  // account signs in on the page it lands on, which says it is confirmed.
  // Only this browser's session, the one just made: if that cannot be ended
  // the page must not say "sign in" to someone who is signed in.
  const signedOut = await client.auth
    .signOut({ scope: "local" })
    .then(({ error: stillSignedIn }) => !stillSignedIn)
    .catch(() => false);
  if (!signedOut) {
    return mergeAuthResponseHeaders(
      privateRedirect(new URL("/home/today", requestUrl)),
      pending,
    );
  }
  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/?auth=confirmed", requestUrl)),
    pending,
  );
}

/**
 * Signing up leads straight into guided setup (owner, 5 Oct 2026). This route
 * is where a new account's confirmation link lands, so it is the one moment
 * that is "just signed up": setup is begun here, and the sign-in that follows
 * opens it (see the sign-in route). Setup stays optional: it can be left.
 *
 * Nothing here may cost the account its confirmation: if setup cannot be
 * begun, the account still confirms and signs in, and setup is reached from
 * You. An account that finished setup is left as it is.
 */
async function startSetup(profiles: ProfileRepository): Promise<void> {
  try {
    await profiles.startSetup();
  } catch {
    // Reached from You instead.
  }
}
