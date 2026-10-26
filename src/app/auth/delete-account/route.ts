import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { deleteOwnAccount } from "@/server/account/delete-account";

/**
 * Deleting an account (ADR-039): the Settings form posts here. A route rather
 * than a Server Action because, like sign-out, it has to clear the session
 * cookies on the same response that leaves the app.
 */
export async function POST(request: Request) {
  // Only the app's own Settings page may ask. The session cookies are
  // SameSite=Lax, so another site's form would arrive signed out anyway;
  // this refuses it before anything is read.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 403 });
  }
  const form = await request.formData();
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);

  const result = await deleteOwnAccount(client, form.get("confirmation"));
  if (result !== "deleted") {
    return privateRedirect(
      new URL(
        `/home/you/settings?delete=${result}#delete-account`,
        request.url,
      ),
    );
  }

  // The person no longer exists on the server, so only the browser's
  // session is cleared; a global sign-out would ask the server about them.
  await client.auth.signOut({ scope: "local" });
  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/?auth=deleted", request.url)),
    pending,
  );
}
