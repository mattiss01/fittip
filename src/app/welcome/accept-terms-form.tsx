"use client";

import Link from "next/link";
import { useActionState } from "react";

import { acceptTermsAction } from "@/app/home/coach-consent-actions";
import { INITIAL_COACH_CONSENT_STATE } from "@/app/home/coach-consent-state";
import styles from "@/components/legal/legal.module.css";

/**
 * Two lines, two decisions (owner, 15 Nov 2026): the Terms, and on its own
 * line the explicit consent to storing health information, which may not
 * ride on accepting terms (EDPB 05/2020, para. 81). Both are needed to go
 * on; the server checks both ticks again.
 */
export function AcceptTermsForm() {
  const [state, accept, accepting] = useActionState(
    acceptTermsAction,
    INITIAL_COACH_CONSENT_STATE,
  );
  return (
    <form action={accept} className={styles.section}>
      <label className={styles.check}>
        <input name="terms" required type="checkbox" />
        <span>
          I agree to the{" "}
          <Link href="/terms" rel="noopener noreferrer" target="_blank">
            Terms
          </Link>
          .
        </span>
      </label>
      <label className={styles.check}>
        <input name="health" required type="checkbox" />
        <span>
          I consent to FitTip storing the health information I enter, such as
          pain, illness or injury, to plan my training.{" "}
          <Link
            href="/privacy#health"
            rel="noopener noreferrer"
            target="_blank"
          >
            What this means
          </Link>
        </span>
      </label>
      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
      <button disabled={accepting} type="submit">
        Continue
      </button>
    </form>
  );
}
