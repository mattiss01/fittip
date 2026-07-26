import { NextResponse } from "next/server";

import {
  createServerUserClient,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  await client.auth.signOut();
  const response = privateRedirect(new URL("/", request.url));
  pending.headers.forEach((value, name) =>
    response.headers.append(name, value),
  );
  return response;
}
