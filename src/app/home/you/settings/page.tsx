import { redirect } from "next/navigation";

import {
  AboutYouForm,
  AppSettingsForm,
  SportsForm,
  WeightHistory,
} from "@/components/profile/profile-forms";
import { TrainingSetupForm } from "@/components/profile/training-forms";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import setupStyles from "../onboarding/onboarding.module.css";
import styles from "../you.module.css";

export const dynamic = "force-dynamic";

/**
 * Settings, reached from the gear on You. It holds what guided setup asks
 * and saves to the profile: the owner's details, their weight history, their
 * sports and their training setup (owner, 6 Oct 2026), and then the app's
 * own settings, the units and the time zone, which setup takes from the
 * browser without asking (owner, 5 Oct 2026). Subscription, language
 * and appearance are meant to land here too, and none is listed until it
 * exists. Sign out stays on You (owner, 2 Oct 2026).
 */
export default async function SettingsPage() {
  let details;
  let weights;
  try {
    const profiles = await createProfileRepository();
    [details, weights] = await Promise.all([
      profiles.getDetails(),
      profiles.listWeightEntries(),
    ]);
  } catch (error) {
    if (
      error instanceof ProfileAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof ProfileAuthenticationError) redirect("/");
    throw error;
  }
  if (!details) redirect("/");

  return (
    <main
      className={`${homeStyles.shell} ${setupStyles.page}`}
      id="main-content"
    >
      <BackLink href="/home/you" label="You" />
      <header className={styles.header}>
        <h1>Settings</h1>
      </header>
      <section className={setupStyles.settingsCard} aria-labelledby="about">
        <h2 id="about">About you</h2>
        <AboutYouForm profile={details} submitLabel="Save" />
      </section>
      <section className={setupStyles.settingsCard} aria-labelledby="weights">
        <h2 id="weights">Weight history</h2>
        <WeightHistory
          entries={weights}
          unitsSystem={details.unitsSystem ?? "metric"}
        />
      </section>
      <section className={setupStyles.settingsCard} aria-labelledby="sports">
        <h2 id="sports">Your sports</h2>
        <SportsForm sports={details.sports} submitLabel="Save sports" />
      </section>
      <section className={setupStyles.settingsCard} aria-labelledby="training">
        <h2 id="training">Training setup</h2>
        <TrainingSetupForm training={details.training} />
      </section>
      <section className={setupStyles.settingsCard} aria-labelledby="app">
        <h2 id="app">App settings</h2>
        <AppSettingsForm profile={details} />
      </section>
    </main>
  );
}
