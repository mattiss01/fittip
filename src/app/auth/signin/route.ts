import { NextResponse } from "next/server";

import {
  createServerUserClient,
  privateRedirect,
} from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const formData = await request.formData();
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  const response = privateRedirect(
    new URL(error ? "/?error=credentials" : "/home", request.url),
  );
  pending.headers.forEach((value, name) =>
    response.headers.append(name, value),
  );
  return response;
}
