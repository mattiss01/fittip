import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";

import Link from "next/link";
import {
  ConsentAuthenticationError,
  createConsents,
} from "@/server/repositories/consent-repository";
import { AcceptTermsForm } from "./accept-terms-form";
import { afterWelcome } from "./after-welcome";
import styles from "@/components/legal/legal.module.css";

export const dynamic = "force-dynamic";

/**
 * The step before the app opens (owner, 15 Nov 2026; ADR-043 decision 5):
 * the Terms and, on its own line, the health consent. The /home layout sends
 * anyone here who has not given both for the current version, or whose
 * decisions could not be read. The coach is asked about separately, after
 * this, and may be declined.
 */
export default async function WelcomePage() {
  let state: "accepted" | "open" | "unavailable";
  try {
    state = (await (await createConsents()).termsAccepted())
      ? "accepted"
      : "open";
  } catch (error) {
    if (error instanceof ConsentAuthenticationError) {
      redirect(
        error.accessError?.reason === "not-owner" ? "/auth/denied" : "/",
      );
    }
    state = "unavailable";
  }
  if (state === "accepted") redirect(await afterWelcome());

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.card} aria-labelledby="welcome-title">
        <Logo />
        <h1 className={styles.title} id="welcome-title">
          Before you start
        </h1>
        {state === "unavailable" ? (
          <div className={styles.section}>
            <p className={styles.error} role="alert">
              FitTip could not check what you agreed to. Nothing was changed.
            </p>
            <Link className="primary-link" href="/welcome">
              Try again
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.section}>
              <p>
                FitTip keeps your training, your notes and what you tell it
                about yourself. Please read the{" "}
                <Link href="/privacy" rel="noopener noreferrer" target="_blank">
                  privacy notice
                </Link>
                : it says what is kept, where and for how long.
              </p>
            </div>
            <AcceptTermsForm />
          </>
        )}
        <form action="/auth/signout" method="post" className={styles.signOut}>
          <button className="text-button" type="submit">
            Not now, sign out
          </button>
        </form>
      </section>
    </main>
  );
}
