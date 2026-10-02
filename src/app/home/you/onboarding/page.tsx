import { redirect } from "next/navigation";

import { OnboardingManager } from "@/components/onboarding/onboarding-manager";
import {
  createOnboardingRepository,
  OnboardingAuthenticationError,
} from "@/server/repositories/onboarding-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import youStyles from "../you.module.css";
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
      <BackLink href="/home/you" label="You" />
      {/* No intro: the start card says what setup stores and that it is
          optional, and the last step is where each item is decided. */}
      <header className={youStyles.header}>
        <h1>Guided setup</h1>
      </header>
      <OnboardingManager snapshot={snapshot} />
    </main>
  );
}
