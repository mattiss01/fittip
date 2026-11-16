"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  decideCoachConsentAction,
  postponeCoachConsentAction,
} from "@/app/home/coach-consent-actions";
import { INITIAL_COACH_CONSENT_STATE } from "@/app/home/coach-consent-state";
import { CoachNotice } from "./coach-notice";
import styles from "./coach-consent.module.css";

/**
 * Asked after sign-in until it is answered (owner, 12 Nov 2026; ADR-043
 * decision 5): Agree and Decline are recorded and are changed from then on in
 * Settings › Coach and your data; ✕ decides nothing and the dialog comes back
 * after the next sign-in.
 *
 * It hides itself the moment a choice is made rather than waiting for the
 * page's refresh, which is what stops it being drawn at all.
 */
export function CoachConsentDialog() {
  const [state, decide, deciding] = useActionState(
    decideCoachConsentAction,
    INITIAL_COACH_CONSENT_STATE,
  );
  const [closed, setClosed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  if (closed || state.status === "saved") return null;

  return (
    <div
      className={styles.backdrop}
      onKeyDown={(event) => {
        // Tab stays inside the dialog; the page behind it must not take
        // focus while it asks. Escape is not a decision, so it does nothing.
        if (event.key !== "Tab") return;
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        if (controls.length === 0) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        const inside = controls.includes(document.activeElement as HTMLElement);
        if (event.shiftKey && (!inside || document.activeElement === first)) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (!inside || document.activeElement === last)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div
        aria-labelledby="coach-consent-title"
        aria-modal="true"
        className={styles.panel}
        ref={panel}
        role="dialog"
        tabIndex={-1}
        data-coach-consent-dialog
      >
        <form
          action={async () => {
            setClosed(true);
            await postponeCoachConsentAction();
          }}
          className={styles.closeForm}
        >
          <button
            aria-label="Close, and ask me after my next sign-in"
            className={styles.close}
            disabled={deciding}
            type="submit"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </form>
        <div className={styles.body}>
          <CoachNotice headingId="coach-consent-title" />
        </div>
        <form action={decide} className={styles.choices}>
          {state.status === "error" ? (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          ) : null}
          <button
            className={styles.secondary}
            disabled={deciding}
            name="decision"
            type="submit"
            value="declined"
          >
            Decline
          </button>
          <button
            className={styles.primary}
            disabled={deciding}
            name="decision"
            type="submit"
            value="agreed"
          >
            Agree
          </button>
        </form>
      </div>
    </div>
  );
}
