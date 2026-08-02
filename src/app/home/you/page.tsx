import { redirect } from "next/navigation";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  ProfileAuthenticationError,
  ProfileRepository,
} from "@/server/repositories/profile-repository";
import styles from "../home.module.css";

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const client = await createServerUserClient();
  let profile;
  try {
    profile = await new ProfileRepository(client).getCurrentProfile();
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
    <main className={styles.shell} id="main-content">
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>FitTip / you</p>
          <h1>Your private space.</h1>
          <p className={styles.intro}>
            Set the outcomes that should direct future coaching, and keep the
            memory FitTip is allowed to use.
          </p>
        </div>
        <p className={styles.stamp}>Verified account</p>
      </header>
      <section className={`${styles.section} ${styles.card}`}>
        <p className={styles.kicker}>Optional guided review</p>
        <h2>Guided setup</h2>
        <p className={styles.bodyCopy}>
          Prepare a private, resumable set of goal and memory candidates, then
          choose exactly what FitTip may save.
        </p>
        <Link className={styles.primaryAction} href="/home/you/onboarding">
          Open guided setup
        </Link>
      </section>
      <section className={`${styles.section} ${styles.card}`}>
        <p className={styles.kicker}>Training direction</p>
        <h2>Goals</h2>
        <p className={styles.bodyCopy}>
          Create and rank up to three core goals, keep supporting goals
          distinct, and preserve paused or finished outcomes.
        </p>
        <Link className={styles.primaryAction} href="/home/you/goals">
          Manage goals
        </Link>
      </section>
      <section className={`${styles.section} ${styles.card}`}>
        <p className={styles.kicker}>Coaching context</p>
        <h2>Memory</h2>
        <p className={styles.bodyCopy}>
          Keep the facts, constraints and preferences FitTip may use. Every
          entry shows where it came from, and you can edit, disable or delete
          any of them.
        </p>
        <Link className={styles.primaryAction} href="/home/you/memory">
          Manage memory
        </Link>
      </section>
      <section className={`${styles.section} ${styles.card}`}>
        <p className={styles.kicker}>Account controls</p>
        <h2>End this session</h2>
        <p className={styles.bodyCopy}>
          Signing out clears the local authenticated session and returns to
          generic sign-in.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
