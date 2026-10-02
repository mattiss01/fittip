import { redirect } from "next/navigation";

import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import styles from "../you.module.css";

export const dynamic = "force-dynamic";

/**
 * Settings, reached from the gear on You. It holds nothing yet: account
 * details, subscription, language and appearance are meant to land here, and
 * none of them is listed until it exists. Sign out stays on You (owner,
 * 2 Oct 2026).
 */
export default async function SettingsPage() {
  let profile;
  try {
    profile = await (await createProfileRepository()).getCurrentProfile();
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
  if (!profile) redirect("/");

  return (
    <main className={homeStyles.shell} id="main-content">
      <BackLink href="/home/you" label="You" />
      <header className={styles.header}>
        <h1>Settings</h1>
      </header>
      <p className={styles.line}>Nothing to set yet.</p>
    </main>
  );
}
