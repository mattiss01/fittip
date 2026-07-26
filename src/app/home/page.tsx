import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  ProfileAuthenticationError,
  ProfileRepository,
} from "@/server/repositories/profile-repository";

export default async function ProtectedHome() {
  const client = await createServerUserClient();

  let profile;
  try {
    profile = await new ProfileRepository(client).getCurrentProfile();
  } catch (error) {
    if (
      error instanceof ProfileAuthenticationError &&
      error.accessError?.policy.mode === "founder-staging" &&
      error.accessError.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    redirect("/");
  }

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
