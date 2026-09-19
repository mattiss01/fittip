"use client";

import { useActionState, useId, useMemo } from "react";

import { INITIAL_PLAN_PROPOSAL_ACTION_STATE } from "./action-state";
import { generatePlanProposalAction } from "./actions";
import styles from "./proposal.module.css";

import {
  PLAN_PROPOSAL_COPY,
  PLAN_PROPOSAL_DEFAULT_DAYS,
  PLAN_PROPOSAL_MAX_DAYS,
  PLAN_PROPOSAL_MIN_DAYS,
  PLAN_PROPOSAL_NOTE_MAX_LENGTH,
} from "@/lib/plan/plan-proposal-copy";

const COPY = PLAN_PROPOSAL_COPY;

/**
 * Asking for a proposal.
 *
 * The idempotency key is generated once per mount and travels on the form. It
 * is what makes an uncertain retry of this submission cheap: the same key
 * returns the running claim instead of buying a second coach call, and on a
 * live binding a second call is a second payment.
 */
export function ComposeProposal({ hasGoals }: { hasGoals: boolean }) {
  const [state, action, pending] = useActionState(
    generatePlanProposalAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const fieldId = useId();
  const idempotencyKey = useMemo(
    () => globalThis.crypto.randomUUID().replaceAll("-", ""),
    [],
  );

  return (
    <section className={styles.compose} aria-label={COPY.composeTitle}>
      <h2>{COPY.composeTitle}</h2>
      <p className={styles.support}>{COPY.composeSupport}</p>
      {hasGoals ? null : <p className={styles.notice}>{COPY.noGoalsNotice}</p>}

      <form
        className={styles.form}
        action={action}
        key={`compose-${state.submission}`}
      >
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-days`}>{COPY.dayCountLabel}</label>
          <input
            id={`${fieldId}-days`}
            name="dayCount"
            type="number"
            inputMode="numeric"
            min={PLAN_PROPOSAL_MIN_DAYS}
            max={PLAN_PROPOSAL_MAX_DAYS}
            step={1}
            required
            defaultValue={state.draft?.dayCount || PLAN_PROPOSAL_DEFAULT_DAYS}
          />
          <p className={styles.helper}>{COPY.dayCountHelper}</p>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${fieldId}-note`}>{COPY.planningNoteLabel}</label>
          <textarea
            id={`${fieldId}-note`}
            name="planningNote"
            rows={3}
            maxLength={PLAN_PROPOSAL_NOTE_MAX_LENGTH}
            defaultValue={state.draft?.planningNote ?? ""}
          />
          <p className={styles.helper}>{COPY.planningNoteHelper}</p>
        </div>

        <p className={styles.consequence}>{COPY.generateSupport}</p>
        <button className={styles.primary} type="submit" disabled={pending}>
          {COPY.generateAction}
        </button>
        <p
          className={state.status === "idle" ? styles.srOnly : styles.notice}
          data-state={pending ? "pending" : state.status}
          role="status"
          aria-live="polite"
        >
          {pending ? COPY.pending : state.message}
        </p>
      </form>
    </section>
  );
}
