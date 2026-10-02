"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { INITIAL_PLAN_PROPOSAL_ACTION_STATE } from "./action-state";
import { generatePlanProposalAction } from "./actions";
import styles from "./proposal.module.css";

import { SheetLayer } from "../plan-sheet";

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
  const [goalPrompt, setGoalPrompt] = useState(false);
  const promptTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (goalPrompt) promptTitle.current?.focus();
  }, [goalPrompt]);
  const idempotencyKey = useMemo(
    () => globalThis.crypto.randomUUID().replaceAll("-", ""),
    [],
  );

  return (
    <section className={styles.compose} aria-label={COPY.composeTitle}>
      <h2>{COPY.composeTitle}</h2>

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
        </div>

        <p className={styles.consequence}>{COPY.generateSupport}</p>
        {hasGoals ? (
          <button className={styles.primary} type="submit" disabled={pending}>
            {COPY.generateAction}
          </button>
        ) : (
          // The action refuses without an active goal, and its refusal used
          // to land under the fold, so the button looked dead (owner, 2 Oct
          // 2026). Without one it asks nothing and opens the way to Goals.
          <button
            className={styles.primary}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setGoalPrompt(true)}
          >
            {COPY.generateAction}
          </button>
        )}
        <p
          className={state.status === "idle" ? styles.srOnly : styles.notice}
          data-state={pending ? "pending" : state.status}
          role="status"
          aria-live="polite"
        >
          {pending ? COPY.pending : state.message}
        </p>
      </form>

      {goalPrompt ? (
        <SheetLayer
          view="goal-needed"
          placement="center"
          labelledBy={`${fieldId}-goal-needed`}
          onClose={() => setGoalPrompt(false)}
        >
          <div className={styles.goalPrompt}>
            <h2 id={`${fieldId}-goal-needed`} ref={promptTitle} tabIndex={-1}>
              {COPY.noGoalsTitle}
            </h2>
            <p>{COPY.noGoalsNotice}</p>
            <Link className={styles.planLink} href="/home/you/goals">
              {COPY.noGoalsLink}
            </Link>
            <button
              className={styles.dangerAction}
              type="button"
              onClick={() => setGoalPrompt(false)}
            >
              {COPY.noGoalsCancel}
            </button>
          </div>
        </SheetLayer>
      ) : null}
    </section>
  );
}
