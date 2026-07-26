import { NextResponse } from "next/server";

import {
  createServerUserClient,
  mergeAuthResponseHeaders,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { readRuntimePolicy } from "@/lib/auth/runtime-policy";

export async function POST(request: Request) {
  if (readRuntimePolicy().mode === "founder-staging") {
    return privateRedirect(new URL("/?error=credentials", request.url));
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8 || password !== confirmation) {
    return privateRedirect(new URL("/signup?error=validation", request.url));
  }

  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL("/auth/callback", request.url).toString(),
    },
  });

  return mergeAuthResponseHeaders(
    privateRedirect(
      new URL(
        error ? "/signup?error=signup" : "/signup?check-email=1",
        request.url,
      ),
    ),
    pending,
  );
}
