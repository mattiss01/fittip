"use client";

import { useActionState } from "react";
import Link from "next/link";

import { changeOnboardingAction } from "@/app/home/you/onboarding/actions";
import { INITIAL_ONBOARDING_ACTION_STATE } from "@/app/home/you/onboarding/action-state";
import styles from "@/app/home/home.module.css";

export function OnboardingHomeInvitation() {
  const [state, action, pending] = useActionState(
    changeOnboardingAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );

  if (state.status === "saved") return null;

  return (
    <section
      className={`${styles.section} ${styles.card}`}
      aria-labelledby="setup-invitation"
    >
      <p className={styles.kicker}>Optional · private draft</p>
      <h2 id="setup-invitation">Set up your coaching context</h2>
      <p className={styles.bodyCopy}>
        Prepare Goals and Memory in six explicit steps. You decide every item;
        setup never blocks planning or logging.
      </p>
      {state.status !== "idle" ? (
        <p className={styles.bodyCopy} role="alert">
          {state.message}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Link className={styles.primaryAction} href="/home/you/onboarding">
          Start setup
        </Link>
        <form action={action}>
          <input name="operation" type="hidden" value="dismiss_prompt" />
          <input name="expectedDraftRevision" type="hidden" value="0" />
          <button
            className={styles.secondaryAction}
            disabled={pending}
            type="submit"
          >
            Not now
          </button>
        </form>
      </div>
    </section>
  );
}
