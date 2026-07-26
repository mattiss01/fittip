import { NextResponse } from "next/server";

import { ProfileRepository } from "@/server/repositories/profile-repository";
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
    const profiles = new ProfileRepository(client);
    await profiles.ensureCurrentProfile();
  } catch {
    return failed();
  }

  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/home", requestUrl)),
    pending,
  );
}
