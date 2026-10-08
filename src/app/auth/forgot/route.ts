import { NextResponse } from "next/server";

import {
  createServerUserClient,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

/** Longer than any address; it only bounds what a request can hand to Auth. */
const EMAIL_MAX_LENGTH = 320;

/**
 * Asks Auth to send a reset mail (ADR-022). One answer whatever happens: an
 * address with an account, one without, a rate limit and a failure all land
 * on the same sentence, so this route cannot be used to learn who has an
 * account. Nothing is stored here, and nothing Auth set while sending is
 * passed on: the link in the mail carries its own code.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (email !== "" && email.length <= EMAIL_MAX_LENGTH) {
    try {
      const client = await createServerUserClient(new NextResponse());
      await client.auth.resetPasswordForEmail(email);
    } catch {
      // The same answer, below.
    }
  }

  return privateRedirect(new URL("/forgot-password?sent=1", request.url));
}
