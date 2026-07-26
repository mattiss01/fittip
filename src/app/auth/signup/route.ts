import { NextResponse } from "next/server";

import { createServerUserClient } from "@/lib/supabase/server-user-client";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8 || password !== confirmation) {
    return NextResponse.redirect(
      new URL("/signup?error=validation", request.url),
    );
  }

  const client = await createServerUserClient();
  const { error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL("/auth/callback", request.url).toString(),
    },
  });

  return NextResponse.redirect(
    new URL(
      error ? "/signup?error=signup" : "/signup?check-email=1",
      request.url,
    ),
  );
}
