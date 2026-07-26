import { NextResponse } from "next/server";

import { createServerUserClient } from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const client = await createServerUserClient();
  await client.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
