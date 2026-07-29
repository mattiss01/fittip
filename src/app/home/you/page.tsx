import { redirect } from "next/navigation";

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
            Account access and sign-out only. Goals and coaching memory will
            appear here only after their own tickets are accepted.
          </p>
        </div>
        <p className={styles.stamp}>Verified account</p>
      </header>
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
