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

import { DateField } from "@/components/date-field/date-field";
import { CoachSpark } from "@/components/home/coach-spark";
import {
  COACH_START_MAX_DAYS_AHEAD,
  shiftIsoDate,
} from "@/lib/date/local-date";
import {
  PLAN_PROPOSAL_COPY,
  PLAN_PROPOSAL_DEFAULT_DAYS,
  PLAN_PROPOSAL_MAX_DAYS,
  PLAN_PROPOSAL_MIN_DAYS,
  PLAN_PROPOSAL_NOTE_MAX_LENGTH,
} from "@/lib/plan/plan-proposal-copy";

const COPY = PLAN_PROPOSAL_COPY;

/** What the days field holds, held to the range the action accepts. */
function clampDays(value: string | undefined): number {
  const days = Number(value);
  if (!Number.isInteger(days)) return PLAN_PROPOSAL_DEFAULT_DAYS;
  return Math.min(
    PLAN_PROPOSAL_MAX_DAYS,
    Math.max(PLAN_PROPOSAL_MIN_DAYS, days),
  );
}

function formatDay(localDate: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T00:00:00.000Z`));
}

/**
 * Asking for a proposal.
 *
 * The idempotency key is generated once per mount and travels on the form. It
 * is what makes an uncertain retry of this submission cheap: the same key
 * returns the running claim instead of buying a second coach call, and on a
 * live binding a second call is a second payment.
 */
/** A planned session the owner may offer for replacement. */
export type ComposablePlannedSession = {
  id: string;
  localDate: string;
  title: string;
  expectedDurationMinutes: number | null;
};

export function ComposeProposal({
  hasGoals,
  today,
  planned,
}: {
  hasGoals: boolean;
  /** The owner's local today: the earliest first day, and the default. */
  today: string;
  /**
   * Active sessions with nothing logged against them, over every day a
   * proposal could cover. The form shows the ones on the days chosen.
   */
  planned: readonly ComposablePlannedSession[];
}) {
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

  // The two fields are followed so the list below shows the days they
  // describe. They are re-seeded from the returned draft when a reply lands,
  // during render rather than in an effect, as the form itself is re-keyed.
  const [seenSubmission, setSeenSubmission] = useState(state.submission);
  const [startDate, setStartDate] = useState(today);
  const [dayCount, setDayCount] = useState(PLAN_PROPOSAL_DEFAULT_DAYS);
  if (seenSubmission !== state.submission) {
    setSeenSubmission(state.submission);
    setStartDate(state.draft?.startDate || today);
    setDayCount(clampDays(state.draft?.dayCount));
  }
  const endDate = shiftIsoDate(startDate, dayCount - 1);
  const onChosenDays = planned.filter(
    (session) => session.localDate >= startDate && session.localDate <= endDate,
  );

  return (
    <section className={styles.compose} aria-label={COPY.composeTitle}>
      <h2>{COPY.composeTitle}</h2>

      <form
        className={styles.form}
        action={action}
        key={`compose-${state.submission}`}
        // Enter in "Days to plan" sends the form whatever its button does,
        // so without a goal the form itself opens the question too.
        onSubmit={
          hasGoals
            ? undefined
            : (event) => {
                event.preventDefault();
                setGoalPrompt(true);
              }
        }
      >
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className={styles.field}>
          {/* The first day is the owner's to choose (9 Oct 2026), so next
              week can be planned on a Friday. The action holds it to the
              same range. */}
          <DateField
            calendar
            initial={state.draft?.startDate || today}
            label={COPY.startDateLabel}
            max={shiftIsoDate(today, COACH_START_MAX_DAYS_AHEAD)}
            min={today}
            name="startDate"
            onChange={(date) => {
              if (date !== "") setStartDate(date);
            }}
            rangeMessage={COPY.startDateRange}
            required
          />
        </div>

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
            onChange={(event) => setDayCount(clampDays(event.target.value))}
          />
        </div>

        {/* What is already there (owner, 9 Oct 2026). Each session stays
            unless it is ticked; only a ticked one may be replaced, and
            nothing is replaced before the review is finished. */}
        <fieldset className={styles.plannedList}>
          <legend>{COPY.plannedHeading}</legend>
          {onChosenDays.length === 0 ? (
            <p className={styles.consequence}>{COPY.plannedNone}</p>
          ) : (
            <>
              <p className={styles.consequence}>{COPY.plannedSupport}</p>
              <ul>
                {onChosenDays.map((session) => (
                  <li key={session.id}>
                    <span className={styles.plannedTitle}>
                      {session.title}
                      <span className={styles.plannedMeta}>
                        {[
                          formatDay(session.localDate),
                          session.expectedDurationMinutes === null
                            ? null
                            : `${session.expectedDurationMinutes} min`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <label className={styles.plannedChoice}>
                      <input
                        type="checkbox"
                        name="replaceable"
                        value={session.id}
                        aria-label={COPY.replaceableLabelFor(session.title)}
                      />
                      {COPY.replaceableLabel}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>

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
            <CoachSpark size={16} />
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
            <CoachSpark size={16} />
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
