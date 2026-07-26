import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  await client.auth.signOut();
  return mergeAuthResponseHeaders(
    privateRedirect(new URL("/", request.url)),
    pending,
  );
}
