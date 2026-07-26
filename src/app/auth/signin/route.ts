import { NextResponse } from "next/server";

import { createServerUserClient } from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const formData = await request.formData();
  const client = await createServerUserClient();
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  return NextResponse.redirect(
    new URL(error ? "/?error=credentials" : "/home", request.url),
  );
}
