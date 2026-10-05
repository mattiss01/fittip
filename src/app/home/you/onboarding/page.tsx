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
import { BackLink } from "../back-link";
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
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <BackLink href="/home/you" label="You" />
      {/* No intro: the start card and the first step say what setup stores
          and that it is optional, and the last step is where each item is
          decided. */}
      <header className={youStyles.header}>
        <h1>Guided setup</h1>
      </header>
      <OnboardingManager profile={profile} snapshot={snapshot} />
    </main>
  );
}
