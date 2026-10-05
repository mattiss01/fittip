import { redirect } from "next/navigation";

import { OnboardingManager } from "@/components/onboarding/onboarding-manager";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";
import {
  createOnboardingRepository,
  OnboardingAuthenticationError,
} from "@/server/repositories/onboarding-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import youStyles from "../you.module.css";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let snapshot;
  let profile: ProfileDetailsView | null;
  try {
    const [onboarding, profiles] = await Promise.all([
      createOnboardingRepository(),
      createProfileRepository(),
    ]);
    [snapshot, profile] = await Promise.all([
      onboarding.load(),
      profiles.getDetails(),
    ]);
  } catch (error) {
    if (
      (error instanceof OnboardingAuthenticationError ||
        error instanceof ProfileAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof OnboardingAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      redirect("/");
    }
    throw error;
  }
  // Signing in creates the profile, so an account without one has no session
  // the app accepts.
  if (!profile) redirect("/");

  return (
    <main
      className={`${homeStyles.shell} ${styles.page} ${styles.setupPage}`}
      id="main-content"
    >
      {/* No intro: the start card says what setup stores and that it is
          optional, and the last step is where each item is decided. An
          account that has just signed up lands past the start card and is
          not told again (owner, 5 Oct 2026). */}
      {/* No back link and no navigation under it (owner, 5 Oct 2026): setup
          is left by "Continue later", or by the links its start and finish
          cards carry. */}
      <header className={`${youStyles.header} ${styles.centered}`}>
        <h1>Guided setup</h1>
      </header>
      <OnboardingManager profile={profile} snapshot={snapshot} />
    </main>
  );
}
