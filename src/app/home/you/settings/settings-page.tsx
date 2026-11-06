import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  createProfileRepository,
  ProfileAuthenticationError,
  type ProfileRepository,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import setupStyles from "../onboarding/onboarding.module.css";
import styles from "../you.module.css";

/**
 * One setting, on a page of its own under Settings (owner, 6 Nov 2026):
 * the way back to the list, the setting's name as the page's heading, and
 * its form in a card, as each section was on the one long page before.
 */
export function SettingPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      className={`${homeStyles.shell} ${setupStyles.page}`}
      id="main-content"
    >
      <BackLink href="/home/you/settings" label="Settings" />
      <header className={styles.header}>
        <h1>{title}</h1>
      </header>
      <section className={setupStyles.settingsCard}>
        {children}
      </section>
    </main>
  );
}

/**
 * Reads what a settings page shows, as the owner. Signed out, or before the
 * profile exists, goes to the start; an account this environment does not
 * allow goes to its notice.
 */
export async function readOwnProfile<T>(
  read: (profiles: ProfileRepository) => Promise<T | null>,
): Promise<T> {
  let found: T | null;
  try {
    found = await read(await createProfileRepository());
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
  if (found === null) redirect("/");
  return found;
}
