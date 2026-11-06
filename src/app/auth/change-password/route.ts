import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import {
  changeOwnPassword,
  createPasswordCheckClient,
} from "@/server/account/change-password";

const PAGE = "/home/you/settings/password";
const SETTINGS = "/home/you/settings";

/**
 * Changing the password while signed in (ADR-042): the Settings page posts
 * here. A route rather than a Server Action because the session's cookies
 * are refreshed on the response. Every outcome goes back to the page as a
 * fixed key; nothing typed is sent back.
 */
export async function POST(request: Request) {
  // Only the app's own page may ask, as for deleting the account.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 403 });
  }
  const form = await request.formData();
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);

  const result = await changeOwnPassword(client, createPasswordCheckClient, {
    current: form.get("current"),
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });

  // Changed, it goes back to Settings, which says so (owner, 6 Nov 2026);
  // refused, back to the form, which says why.
  const changed = result === "changed";
  const target = new URL(changed ? SETTINGS : PAGE, request.url);
  target.searchParams.set(changed ? "password" : "error", result);
  return mergeAuthResponseHeaders(privateRedirect(target), pending);
}
