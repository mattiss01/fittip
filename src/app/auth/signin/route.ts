import { NextResponse } from "next/server";

import {
  createServerUserClient,
  privateRedirect,
} from "@/lib/supabase/server-user-client";
import { ProfileRepository } from "@/server/repositories/profile-repository";

export async function POST(request: Request) {
  const formData = await request.formData();
  const pending = new NextResponse();
  const client = await createServerUserClient(pending);
  const { error } = await client.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!error) {
    try {
      await new ProfileRepository(client).ensureCurrentProfile();
    } catch {
      await client.auth.signOut();
      const response = privateRedirect(
        new URL("/?error=credentials", request.url),
      );
      pending.headers.forEach((value, name) =>
        response.headers.append(name, value),
      );
      return response;
    }
  }

  const response = privateRedirect(
    new URL(error ? "/?error=credentials" : "/home", request.url),
  );
  pending.headers.forEach((value, name) =>
    response.headers.append(name, value),
  );
  return response;
}
