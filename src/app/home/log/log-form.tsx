"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { logCompletionAction } from "./actions";
import {
  COMPLETION_FEELING_CHOICES,
  COMPLETION_SAFETY_NOTICE,
  COMPLETION_SIGNALS,
  INITIAL_LOG_ACTION_STATE,
  PLANNED_OUTCOMES,
  UNPLANNED_OUTCOME,
  type CompletionOutcome,
  type LogActionState,
} from "./log-action-state";
import styles from "./log.module.css";

/** The planned session this log answers to, when there is one. */
export type LogPlannedView = {
  id: string;
  localDate: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
};

/** The record being edited, as the owner last read it. */
export type LogExistingView = {
  id: string;
  revision: number;
  outcome: CompletionOutcome;
  actualLocalDate: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: string | null;
  note: string | null;
  replacementDescription: string | null;
  pain: boolean;
  illness: boolean;
  injury: boolean;
  severeFatigue: boolean;
};

type Props = {
  planned: LogPlannedView | null;
  existing: LogExistingView | null;
  /** The date the form starts on: the planned day, or the day it was opened. */
  defaultDate: string;
  /** The day on Today the owner returns to once the write lands. */
  returnDate: string;
};

export function LogForm({ planned, existing, defaultDate, returnDate }: Props) {
  const [state, action, pending] = useActionState<LogActionState, FormData>(
    logCompletionAction,
    INITIAL_LOG_ACTION_STATE,
  );
  const choices = planned === null ? [UNPLANNED_OUTCOME] : PLANNED_OUTCOMES;
  const [outcome, setOutcome] = useState<CompletionOutcome>(
    existing?.outcome ?? choices[0].value,
  );
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const saved = state.status === "saved";

  // The receipt replaces the form, which takes the only live region and the
  // focused control with it. Without this a keyboard or screen-reader user is
  // returned to the document body with no signal that the write landed.
  useEffect(() => {
    if (saved) receiptHeading.current?.focus();
  }, [saved, state.submission]);

  if (saved) {
    return (
      <section
        className={styles.receipt}
        data-log-receipt={state.result}
        role="status"
        aria-live="polite"
      >
        <p className={styles.sectionLabel}>Written</p>
        <h2 ref={receiptHeading} tabIndex={-1}>
          {state.message}
        </h2>
        <p className={styles.bodyCopy}>
          Your training record is separate from your plan. Nothing on the plan
          moved because of this.
        </p>
        <Link
          className={styles.primary}
          href={`/home/today?date=${state.returnDate ?? returnDate}`}
        >
          Back to that day
        </Link>
      </section>
    );
  }

  return (
    <form className={styles.form} action={action} data-log-form>
      <input
        type="hidden"
        name="operation"
        value={existing === null ? "create" : "edit"}
      />
      <input type="hidden" name="returnDate" value={returnDate} />
      {existing === null ? null : (
        <>
          <input type="hidden" name="completionId" value={existing.id} />
          <input
            type="hidden"
            name="expectedRevision"
            value={existing.revision}
          />
        </>
      )}
      {planned === null || existing !== null ? null : (
        <>
          <input type="hidden" name="plannedSessionId" value={planned.id} />
          <input type="hidden" name="plannedDate" value={planned.localDate} />
        </>
      )}

      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={state.status}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>

      {choices.length === 1 ? (
        <>
          <input type="hidden" name="status" value={choices[0].value} />
          <p className={styles.fieldHint} data-log-fixed-outcome>
            {choices[0].hint} It is recorded as {choices[0].label.toLowerCase()}{" "}
            training, with no planned session attached.
          </p>
        </>
      ) : (
        <fieldset className={styles.choices}>
          <legend>What happened</legend>
          {choices.map((choice) => (
            <label key={choice.value} className={styles.choice}>
              <input
                type="radio"
                name="status"
                value={choice.value}
                checked={outcome === choice.value}
                onChange={() => setOutcome(choice.value)}
              />
              <span>
                <strong>{choice.label}</strong>
                <span className={styles.fieldHint}>{choice.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {outcome === "replaced" ? (
        <div className={styles.field}>
          <label htmlFor="log-replacement">What you did instead</label>
          <textarea
            id="log-replacement"
            name="replacementDescription"
            rows={2}
            maxLength={500}
            required
            defaultValue={existing?.replacementDescription ?? ""}
          />
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="log-date">Date</label>
        <input
          id="log-date"
          name="actualLocalDate"
          type="date"
          required
          defaultValue={existing?.actualLocalDate ?? defaultDate}
        />
        <span className={styles.fieldHint}>
          The day the training happened, on your own calendar.
        </span>
      </div>

      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor="log-duration">Duration (minutes)</label>
          <input
            id="log-duration"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={10080}
            step={1}
            defaultValue={existing?.durationMinutes ?? ""}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="log-effort">Effort (1-10)</label>
          <input
            id="log-effort"
            name="perceivedEffort"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            step={1}
            defaultValue={existing?.perceivedEffort ?? ""}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="log-feeling">How it felt</label>
        <select
          id="log-feeling"
          name="feeling"
          defaultValue={existing?.feeling ?? ""}
        >
          <option value="">Not recorded</option>
          {COMPLETION_FEELING_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="log-note">Note</label>
        <textarea
          id="log-note"
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={existing?.note ?? ""}
        />
      </div>

      <fieldset className={styles.signals}>
        <legend>Anything to report</legend>
        <p className={styles.fieldHint}>
          FitTip records these as facts you reported. It does not diagnose, and
          it changes nothing on your plan.
        </p>
        {COMPLETION_SIGNALS.map((signal) => (
          <label key={signal.name} className={styles.checkField}>
            <input
              type="checkbox"
              name={signal.name}
              value="true"
              defaultChecked={defaultSignal(existing, signal.name)}
            />
            <span>{signal.label}</span>
          </label>
        ))}
        <p className={styles.safety}>{COMPLETION_SAFETY_NOTICE}</p>
      </fieldset>

      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save log"}
        </button>
        <Link
          className={styles.secondary}
          href={`/home/today?date=${returnDate}`}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function defaultSignal(existing: LogExistingView | null, name: string) {
  if (existing === null) return false;
  if (name === "painReported") return existing.pain;
  if (name === "illnessReported") return existing.illness;
  if (name === "injuryReported") return existing.injury;
  return existing.severeFatigue;
}
