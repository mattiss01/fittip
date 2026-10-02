import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
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
      <Link className={styles.backLink} href="/home/you">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        You
      </Link>
      <header className={styles.header}>
        <h1>Settings</h1>
      </header>
      <p className={styles.nothingYet}>Nothing to set yet.</p>
    </main>
  );
}
