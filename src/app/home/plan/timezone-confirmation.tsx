"use client";

import { useActionState, useSyncExternalStore } from "react";

import {
  INITIAL_TIMEZONE_ACTION_STATE,
  type TimezoneActionState,
} from "./action-state";
import { confirmPlanTimezoneAction } from "./actions";
import styles from "./plan.module.css";

/**
 * The browser only proposes; the owner confirms and the profile stores. Every
 * planning rule is then judged against the stored value, so a later request
 * from a different device cannot move the past boundary by claiming a zone.
 */
export function TimezoneConfirmation() {
  const [state, action, pending] = useActionState<
    TimezoneActionState,
    FormData
  >(confirmPlanTimezoneAction, INITIAL_TIMEZONE_ACTION_STATE);
  const detected = useSyncExternalStore(subscribeNothing, readZone, () => null);

  return (
    <section className={styles.zoneCard} aria-labelledby="plan-zone-heading">
      <h2 id="plan-zone-heading">Confirm your time zone</h2>
      <p>
        Your plan counts days on your own calendar. FitTip stores the zone you
        confirm here and uses it to decide which dates are still ahead of you.
        Nothing is planned until you confirm it.
      </p>
      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={state.status}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>
      {detected === null ? (
        <p className={styles.zoneValue}>Reading your browser time zone…</p>
      ) : (
        <form action={action}>
          <span className={styles.zoneValue}>{detected}</span>
          <input type="hidden" name="timezoneName" value={detected} />
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? "Saving…" : `Use ${detected}`}
          </button>
        </form>
      )}
    </section>
  );
}

function subscribeNothing() {
  return () => {};
}

/**
 * Read on the client only. The server renders the waiting copy and the client
 * agrees on its first render, so hydration cannot mismatch.
 */
function readZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
