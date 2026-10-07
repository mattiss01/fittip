import { redirect } from "next/navigation";

import { OnboardingManager } from "@/components/onboarding/onboarding-manager";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";
import type { SetupGoalView } from "@/lib/setup/setup-steps";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import youStyles from "../you.module.css";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ remind?: string | string[] }>;
}) {
  // Set by the sign-in route alone, and it only chooses between two fixed
  // screens; nothing else is read from it.
  const reminder = (await searchParams)?.remind === "1";
  let profile: ProfileDetailsView | null;
  let goals: SetupGoalView[];
  try {
    const [goalRepository, profiles] = await Promise.all([
      createGoalRepository(),
      createProfileRepository(),
    ]);
    const [collection, details] = await Promise.all([
      goalRepository.list(),
      profiles.getDetails(),
    ]);
    profile = details;
    // The goals in play, core first and each kind in its own order: the ones
    // setup's goals screen goes on from. Paused and finished goals are
    // Goals' to show.
    goals = collection.goals
      .filter((goal) => goal.status === "active" && goal.activeRank !== null)
      .sort(
        (left, right) =>
          left.priorityTier.localeCompare(right.priorityTier) ||
          left.activeRank! - right.activeRank!,
      )
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        desiredOutcome: goal.desiredOutcome,
        sports: goal.sports,
        targetDate: goal.targetDate,
        priorityTier: goal.priorityTier,
      }));
  } catch (error) {
    if (
      (error instanceof GoalAuthenticationError ||
        error instanceof ProfileAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof GoalAuthenticationError ||
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
      {/* No intro: the start card says what setup is and that it is
          optional. An account that has just signed up lands past the start
          card and is not told again (owner, 5 Oct 2026). */}
      {/* No back link and no navigation under it (owner, 5 Oct 2026): setup
          is left by "Continue later", or by the links its start and finish
          cards carry. */}
      <header className={`${youStyles.header} ${styles.centered}`}>
        <h1>Guided setup</h1>
      </header>
      <OnboardingManager
        goals={goals}
        profile={profile}
        // Only while there is a setup to go on with; without one the start
        // card is what there is to show.
        reminder={
          reminder && profile.setup.step !== null && !profile.setup.finished
        }
      />
    </main>
  );
}
