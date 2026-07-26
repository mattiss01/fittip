import { NextResponse } from "next/server";

import { ProfileRepository } from "@/server/repositories/profile-repository";
import { createServerUserClient } from "@/lib/supabase/server-user-client";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/?auth=confirmation-failed", requestUrl),
    );
  }

  const client = await createServerUserClient();
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/?auth=confirmation-failed", requestUrl),
    );
  }

  try {
    const profiles = new ProfileRepository(client);
    await profiles.ensureCurrentProfile();
  } catch {
    return NextResponse.redirect(
      new URL("/?auth=confirmation-failed", requestUrl),
    );
  }

  return NextResponse.redirect(new URL("/home", requestUrl));
}
