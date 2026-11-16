import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";

import Link from "next/link";
import {
  ConsentAuthenticationError,
  createConsents,
} from "@/server/repositories/consent-repository";
import { AcceptTermsForm } from "./accept-terms-form";
import styles from "@/components/legal/legal.module.css";

export const dynamic = "force-dynamic";

/**
 * The step before the app opens (owner, 15 Nov 2026; ADR-043 decision 5):
 * the Terms and, on its own line, the health consent. The /home layout sends
 * anyone here who has not given both for the current version. The coach is
 * asked about separately, after this, and may be declined.
 */
export default async function WelcomePage() {
  let accepted: boolean;
  try {
    const consents = await createConsents();
    const [terms, health] = await Promise.all([
      consents.current("terms"),
      consents.current("health"),
    ]);
    accepted = terms.status === "agreed" && health.status === "agreed";
  } catch (error) {
    if (
      error instanceof ConsentAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    redirect("/");
  }
  if (accepted) redirect("/home/today");

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.card} aria-labelledby="welcome-title">
        <Logo />
        <h1 className={styles.title} id="welcome-title">
          Before you start
        </h1>
        <div className={styles.section}>
          <p>
            FitTip keeps your training, your notes and what you tell it about
            yourself. Please read the{" "}
            <Link href="/privacy" rel="noopener noreferrer" target="_blank">
              privacy notice
            </Link>
            : it says what is kept, where and for how long.
          </p>
        </div>
        <AcceptTermsForm />
        <form action="/auth/signout" method="post" className={styles.signOut}>
          <button className="text-button" type="submit">
            Not now, sign out
          </button>
        </form>
      </section>
    </main>
  );
}
