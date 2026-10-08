import { NextResponse } from "next/server";

import { validateSignUpCredentials } from "@/lib/auth/credentials";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

/** A code is far shorter; this only bounds what is handed to Auth. */
const TOKEN_MAX_LENGTH = 500;

/**
 * Sets a new password from a reset link (ADR-022). The order is the point:
 *
 * 1. The two passwords are checked before the link's code is touched, so a
 *    typo sends the owner back to the form with the link still good.
 * 2. The code is verified, which spends it and gives this request a session.
 * 3. The runtime policy is asked whether this account may use this
 *    environment, so on the hosted app only the owner's can be reset.
 * 4. The password is set, and every session of the account is ended, this
 *    one included (owner, 8 Oct 2026). Sign-in is where it lands.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const tokenHash = String(formData.get("token_hash") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const failed = (reason: "link" | "password") =>
    new URL(`/forgot-password?error=${reason}`, request.url);

  if (tokenHash === "" || tokenHash.length > TOKEN_MAX_LENGTH) {
    return privateRedirect(failed("link"));
  }
  if (!validateSignUpCredentials(password, confirmation).valid) {
    const form = new URL("/reset-password", request.url);
    form.searchParams.set("token_hash", tokenHash);
    form.searchParams.set("error", "validation");
    return privateRedirect(form);
  }

  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (error) {
    return mergeAuthResponseHeaders(privateRedirect(failed("link")), pending);
  }

  // From here this request holds a session. Whatever happens next, it is
  // ended before the answer goes out. On the refusals only this request's is:
  // a reset that changed nothing must not sign the account's other devices
  // out, and a bare `signOut()` would, since its scope is every session.
  const refuse = async (reason: "link" | "password") => {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return mergeAuthResponseHeaders(privateRedirect(failed(reason)), pending);
  };

  try {
    await requireAllowedVerifiedUser(client);
  } catch {
    return refuse("link");
  }

  // The code is spent and the password is the old one: a new link is the
  // way on. Auth refuses, among others, the password the account has.
  const changed = await client.auth
    .updateUser({ password })
    .then(({ error: refused }) => !refused)
    .catch(() => false);
  if (!changed) return refuse("password");

  // The password is the new one. This browser is signed out whatever
  // became of the others.
  const everywhere = await client.auth
    .signOut({ scope: "global" })
    .then(({ error: stillSignedIn }) => !stillSignedIn)
    .catch(() => false);
  if (!everywhere) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/?auth=password-changed", request.url)),
    pending,
  );
}
