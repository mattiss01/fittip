import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingManager } from "@/components/onboarding/onboarding-manager";
import {
  createOnboardingRepository,
  OnboardingAuthenticationError,
} from "@/server/repositories/onboarding-repository";
import homeStyles from "../../home.module.css";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let snapshot;
  try {
    snapshot = await (await createOnboardingRepository()).load();
  } catch (error) {
    if (
      error instanceof OnboardingAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof OnboardingAuthenticationError) redirect("/");
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <Link className={homeStyles.backLink} href="/home/you">
        ← You
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / you / guided setup</p>
          <h1>Build the coaching brief.</h1>
          <p className={homeStyles.intro}>
            Six explicit steps prepare candidates for Goals and Memory. You
            decide every item before anything is filed.
          </p>
        </div>
        <p className={homeStyles.stamp}>
          {snapshot.draft
            ? `Draft ${snapshot.draft.revision}`
            : "Optional setup"}
        </p>
      </header>
      <OnboardingManager snapshot={snapshot} />
    </main>
  );
}
