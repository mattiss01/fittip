"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { logCompletionAction } from "./actions";
import {
  ActualActivities,
  type LogPlannedActivityView,
} from "./actual-activities";
import {
  COMPLETION_FEELING_CHOICES,
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SAFETY_NOTICE,
  COMPLETION_SIGNALS,
  INITIAL_LOG_ACTION_STATE,
  PLANNED_OUTCOMES,
  UNPLANNED_OUTCOME,
  type CompletionOutcome,
  type LogActionState,
} from "./log-action-state";
import styles from "./log.module.css";

import homeStyles from "../home.module.css";

/** The planned session this log answers to, when there is one. */
export type LogPlannedView = {
  id: string;
  localDate: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  /** In plan order. Offered only when the log is first written. */
  activities: LogPlannedActivityView[];
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
  /**
   * The first completion activity, which is where an unplanned log's title and
   * sport live. Null on a planned log, whose name comes from the planned
   * snapshot, and on an unplanned log written before this surface collected
   * them.
   */
  activityName: string | null;
  activitySport: string | null;
  /**
   * What a planned log recorded per activity, already in words. Read back
   * rather than offered: the write function refuses to restate a planned
   * log's activities, so an input here would take a correction and drop it.
   */
  activities: { position: number; name: string; actual: string | null }[];
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
  /**
   * Owner-local today. The input stops here so the owner is told before the
   * round trip; the rule itself lives in the write function, because a check
   * only the form performs is a courtesy rather than a constraint.
   */
  today: string;
  /**
   * Set when this planned session already carries a log, so the owner is told
   * before filling anything in rather than refused at the end. It lives here
   * rather than replacing the form on the page because a server action
   * refreshes the page it was called from: deciding this on the server would
   * turn the owner's own receipt into this notice the moment they saved.
   */
  alreadyLogged?: { id: string; dayLabel: string } | null;
  /** The day on Today the owner returns to once the write lands. */
  returnDate: string;
};

export function LogForm({
  planned,
  existing,
  alreadyLogged = null,
  defaultDate,
  today,
  returnDate,
}: Props) {
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
  // Training that did not happen has no duration, no effort and no way it
  // felt, so those three are not asked. Derived during render rather than
  // mirrored into state, so there is one source of truth for the outcome.
  const skipped = outcome === "skipped";
  // Per-activity actuals belong to a session that happened, in whole or in
  // part. Skipped and replaced both say the planned activities did not, so
  // the list is not asked and a create sends none. A session planned with no
  // activities is still offered the list, because one can be added.
  const offerActivities =
    planned !== null &&
    existing === null &&
    (outcome === "completed" || outcome === "partially_completed");
  // Everything the chosen outcome would discard from a record that already
  // exists. A field this form stops rendering submits nothing, and the write
  // function assigns every one of these from the payload, so an absent key
  // stores null. "What you did instead" belongs here for the same reason the
  // three numbers do: it is unmounted by every outcome but `replaced`, and a
  // log carrying only a description would otherwise lose it in silence.
  const discarded =
    existing === null
      ? []
      : [
          ...(skipped && existing.durationMinutes !== null
            ? ["the duration"]
            : []),
          ...(skipped && existing.perceivedEffort !== null
            ? ["the effort"]
            : []),
          ...(skipped && existing.feeling !== null ? ["how it felt"] : []),
          ...(outcome !== "replaced" && existing.replacementDescription !== null
            ? ["what you did instead"]
            : []),
        ];

  // The receipt replaces the form, which takes the only live region and the
  // focused control with it. Without this a keyboard or screen-reader user is
  // returned to the document body with no signal that the write landed.
  useEffect(() => {
    if (saved) receiptHeading.current?.focus();
  }, [saved, state.submission]);

  if (alreadyLogged !== null && !saved) {
    return (
      <section className={homeStyles.stateCard} data-log-state="already-logged">
        <p className={homeStyles.sectionLabel}>Already logged</p>
        <h2>This session is already logged.</h2>
        <p>
          The log is dated {alreadyLogged.dayLabel}. One planned session carries
          one log, and that log can be corrected.
        </p>
        <div className={homeStyles.actions}>
          <Link
            className={homeStyles.primaryAction}
            href={`/home/log?completion=${alreadyLogged.id}`}
          >
            Open that log
          </Link>
        </div>
      </section>
    );
  }

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
          {/* Unplanned training carries its name as its one activity, so this
              is the only place that name lives - and correcting it is an
              ordinary edit, not a rewrite of anything a plan promised. */}
          <div className={styles.field}>
            <label htmlFor="log-title">Title</label>
            <input
              id="log-title"
              name="title"
              type="text"
              required
              maxLength={120}
              autoComplete="off"
              defaultValue={existing?.activityName ?? ""}
            />
            <span className={styles.fieldHint}>
              What you did, in your own words.
            </span>
          </div>
          <div className={styles.field}>
            <label htmlFor="log-sport">Sport</label>
            <input
              id="log-sport"
              name="sport"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              defaultValue={existing?.activitySport ?? ""}
            />
            <span className={styles.fieldHint}>
              Whatever you call it. FitTip keeps your own words.
            </span>
          </div>
          {existing === null ? null : (
            // What the naming was, so an edit that changes neither sends no
            // activity list and leaves whatever else the record carries alone.
            <>
              <input
                type="hidden"
                name="originalTitle"
                value={existing.activityName ?? ""}
              />
              <input
                type="hidden"
                name="originalSport"
                value={existing.activitySport ?? ""}
              />
            </>
          )}
        </>
      ) : (
        // A select, like "How it felt", rather than four full-width rules: the
        // owner asked for it on 25 September 2026. The chosen outcome's hint
        // stays beneath it, so what each one means is still said.
        <div className={styles.field}>
          <label htmlFor="log-status">What happened</label>
          <select
            id="log-status"
            name="status"
            value={outcome}
            onChange={(event) =>
              setOutcome(event.target.value as CompletionOutcome)
            }
          >
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint}>
            {choices.find((choice) => choice.value === outcome)?.hint}
          </span>
        </div>
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
          max={today}
          defaultValue={existing?.actualLocalDate ?? defaultDate}
        />
        <span className={styles.fieldHint}>
          The day the training happened, on your own calendar. Training cannot
          be logged before it happens, so this stops at today.
        </span>
      </div>

      {discarded.length === 0 ? null : (
        <p className={styles.warning} data-log-clears role="status">
          Saving this as {COMPLETION_OUTCOME_LABELS[outcome].toLowerCase()}{" "}
          removes {listPhrase(discarded)}. Your note and anything you reported
          stay.
        </p>
      )}

      {skipped ? null : (
        <>
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
                // A new log starts at what the plan expected, like its
                // activities do; an edit starts at what was recorded.
                defaultValue={
                  existing === null
                    ? (planned?.expectedDurationMinutes ?? "")
                    : (existing.durationMinutes ?? "")
                }
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
        </>
      )}

      {offerActivities ? (
        <ActualActivities
          activities={planned.activities}
          sessionSport={planned.sport}
        />
      ) : null}

      {existing === null ||
      planned === null ||
      existing.activities.length === 0 ? null : (
        <section className={styles.activities} data-log-recorded-activities>
          <p className={styles.sectionLabel}>What you did</p>
          <ol className={styles.activityRows}>
            {existing.activities.map((activity) => (
              <li className={styles.activityRow} key={activity.position}>
                <p className={styles.activityName}>{activity.name}</p>
                <p className={styles.activityLine}>
                  Did: {activity.actual ?? "not measured"}
                </p>
              </li>
            ))}
          </ol>
          <p className={styles.fieldHint}>
            These were recorded when the log was written and cannot be corrected
            here yet.
          </p>
        </section>
      )}

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

/** "a, b and c", so the warning names every field rather than a count. */
function listPhrase(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function defaultSignal(existing: LogExistingView | null, name: string) {
  if (existing === null) return false;
  if (name === "painReported") return existing.pain;
  if (name === "illnessReported") return existing.illness;
  if (name === "injuryReported") return existing.injury;
  return existing.severeFatigue;
}
