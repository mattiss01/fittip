"use client";

import { useActionState } from "react";

import { decideCoachConsentAction } from "@/app/home/coach-consent-actions";
import { INITIAL_COACH_CONSENT_STATE } from "@/app/home/coach-consent-state";
import styles from "./coach-consent.module.css";

/**
 * The decision in force and the one way to change it: Withdraw when agreed,
 * Agree when declined, and both when nothing is decided. Withdrawing is a
 * decline, recorded like any other; what the coach already made stays.
 */
export function CoachConsentSettings({
  status,
  statusText,
}: {
  status: "agreed" | "declined" | "undecided";
  statusText: string;
}) {
  const [state, decide, deciding] = useActionState(
    decideCoachConsentAction,
    INITIAL_COACH_CONSENT_STATE,
  );

  return (
    <form action={decide} className={styles.settingsChoices}>
      <p className={styles.status} role="status" data-coach-consent-status>
        {statusText}
      </p>
      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
      {status === "agreed" ? (
        <button
          className={styles.secondary}
          disabled={deciding}
          name="decision"
          type="submit"
          value="declined"
        >
          Withdraw
        </button>
      ) : (
        <button
          className={styles.primary}
          disabled={deciding}
          name="decision"
          type="submit"
          value="agreed"
        >
          Agree
        </button>
      )}
      {status === "undecided" ? (
        <button
          className={styles.secondary}
          disabled={deciding}
          name="decision"
          type="submit"
          value="declined"
        >
          Decline
        </button>
      ) : null}
    </form>
  );
}
