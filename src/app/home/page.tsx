import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import {
  isAllowedVerifiedUser,
  readRuntimePolicy,
} from "@/lib/auth/runtime-policy";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import { ProfileRepository } from "@/server/repositories/profile-repository";

export default async function ProtectedHome() {
  const policy = readRuntimePolicy();
  const client = await createServerUserClient();
  const { data, error } = await client.auth.getClaims();

  if (!isAllowedVerifiedUser(policy, error ? undefined : data?.claims.sub)) {
    redirect("/");
  }

  const profile = await new ProfileRepository(client).getCurrentProfile();
  if (!profile) {
    redirect("/");
  }

  return (
    <main>
      <section className="home-card" aria-labelledby="home-title">
        <p className="eyebrow">FitTip / private space</p>
        <h1 id="home-title">You’re in.</h1>
        <p>
          Your verified account is ready. The first coaching tools will appear
          here when their approved slices are complete.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
