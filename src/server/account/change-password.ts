import "server-only";

import { createClient } from "@supabase/supabase-js";

import { validateSignUpCredentials } from "@/lib/auth/credentials";
import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import type { Database } from "@/lib/supabase/database.types";
import { readServerSupabaseEnvironment } from "@/lib/supabase/server-environment";
import type { ServerUserClient } from "@/lib/supabase/server-user-client";

/** Each outcome is a fixed key; the page maps it to copy (ADR-042). */
export type ChangePasswordResult =
  | "changed"
  /** Changed, but the other devices could not all be signed out. */
  | "changed-partial"
  /** The new password is too short, or the two do not match. */
  | "validation"
  /** No signed-in person, or one this environment does not allow. */
  | "session"
  /** The current password is not the account's. */
  | "current"
  /** Auth refused the new password, for one the account already has. */
  | "password"
  | "error";

/** A client that can sign in once without becoming the browser's session. */
export type CheckingClient = {
  auth: {
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: unknown }>;
    signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
  };
};

/**
 * Changes the signed-in person's password (ADR-042, owner, 6 Nov 2026).
 *
 * In this order, and nothing after a refusal: the new pair is checked, then
 * the session; the current password is checked by signing in with the
 * session's own address on a client with no cookies, which is signed out
 * again at once; then the new password is set on the browser's session and
 * every other session of the account ends. This one stays signed in.
 */
export async function changeOwnPassword(
  client: ServerUserClient,
  makeChecker: () => CheckingClient,
  form: { current: unknown; password: unknown; confirmation: unknown },
): Promise<ChangePasswordResult> {
  const current = typeof form.current === "string" ? form.current : "";
  const password = typeof form.password === "string" ? form.password : "";
  const confirmation =
    typeof form.confirmation === "string" ? form.confirmation : "";
  if (!validateSignUpCredentials(password, confirmation).valid) {
    return "validation";
  }
  if (current === "") return "current";

  let email: string;
  try {
    await requireAllowedVerifiedUser(client);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) return "session";
    email = data.user.email;
  } catch {
    return "session";
  }

  try {
    const checker = makeChecker();
    const { error } = await checker.auth.signInWithPassword({
      email,
      password: current,
    });
    if (error) return "current";
    // Its session lives for this request only; the sign-out of the others
    // below ends it as well, should this fail.
    await checker.auth.signOut({ scope: "local" }).catch(() => undefined);
  } catch {
    return "error";
  }

  const changed = await client.auth
    .updateUser({ password })
    .then(({ error }) => !error)
    .catch(() => false);
  if (!changed) return "password";

  const othersOut = await client.auth
    .signOut({ scope: "others" })
    .then(({ error }) => !error)
    .catch(() => false);
  return othersOut ? "changed" : "changed-partial";
}

/**
 * The checking client: the app's own public URL and key, nothing stored and
 * nothing refreshed, so its sign-in never reaches a cookie.
 */
export function createPasswordCheckClient(): CheckingClient {
  const environment = readServerSupabaseEnvironment();
  return createClient<Database>(environment.url, environment.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
