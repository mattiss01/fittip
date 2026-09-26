"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { logCompletionAction } from "./actions";
import {
  ActualActivities,
  type LogPlannedActivityView,
  type LogRecordedActivityView,
} from "./actual-activities";
import {
  COMPLETION_FEELING_CHOICES,
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SAFETY_NOTICE,
  COMPLETION_SIGNALS,
  INITIAL_LOG_ACTION_STATE,
  PLANNED_OUTCOMES,
  TRAINED_OUTCOMES,
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
  /** The planned day in words, e.g. "Thu 1 Oct", formatted by the page. */
  dayLabel: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  /**
   * In plan order: the live plan's on a create, the snapshot's on an edit,
   * which is what the log was measured against.
   */
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
   * The log's own name, or the snapshot's for a log written before logs
   * carried one. Null only on unplanned training that never had a name.
   */
  title: string | null;
  sport: string | null;
  /** What the log records per activity, in the order it was done. */
  activities: LogRecordedActivityView[];
  /** The unplanned log a replaced one points at, if it points anywhere. */
  replacedById: string | null;
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
  /**
   * Unplanned training a replaced log may point at: this owner's, from a
   * week before the planned day to today, most recent first.
   */
  unplannedOptions?: LogUnplannedOption[];
};

/** One unplanned log a replaced one may point at, already in words. */
export type LogUnplannedOption = { id: string; label: string };

export function LogForm({
  planned,
  existing,
  alreadyLogged = null,
  defaultDate,
  today,
  returnDate,
  unplannedOptions = [],
}: Props) {
  const [state, action, pending] = useActionState<LogActionState, FormData>(
    logCompletionAction,
    INITIAL_LOG_ACTION_STATE,
  );
  const choices = planned === null ? [UNPLANNED_OUTCOME] : PLANNED_OUTCOMES;
  const [outcome, setOutcome] = useState<CompletionOutcome>(
    existing?.outcome ?? choices[0].value,
  );
  const [actualDate, setActualDate] = useState(
    existing?.actualLocalDate ?? defaultDate,
  );
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const saved = state.status === "saved";
  // Training that did not happen has no duration, no effort and no way it
  // felt, so those three are not asked. Derived during render rather than
  // mirrored into state, so there is one source of truth for the outcome.
  const skipped = outcome === "skipped";
  // Per-activity actuals belong to training that happened, in whole or in
  // part, planned or not. Skipped and replaced both say the planned
  // activities did not, so the list is not asked and nothing is sent for it.
  const activitiesHappened =
    outcome === "completed" ||
    outcome === "partially_completed" ||
    outcome === "unplanned";
  // Done on another day than planned: the planned session done early or late,
  // or extra training with the planned one still ahead. Only a new log asks,
  // and only for training that happened; a skip or a replacement is about the
  // planned session whatever day it is written on.
  const askWhichDay =
    planned !== null &&
    existing === null &&
    actualDate !== planned.localDate &&
    TRAINED_OUTCOMES.has(outcome);
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
          ...(!activitiesHappened && existing.activities.length > 0
            ? ["the activities"]
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

      {/* Every log carries its own name. A planned one starts as the plan's,
          and changing it here renames the log alone: the plan, and the
          snapshot the log was measured against, keep theirs. */}
      <div className={styles.field}>
        <label htmlFor="log-title">Title</label>
        <input
          id="log-title"
          name="title"
          type="text"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={existing?.title ?? planned?.title ?? ""}
        />
        <span className={styles.fieldHint}>
          {planned === null
            ? "What you did, in your own words."
            : "Taken from the plan. Change it if you did something else; the plan keeps its own."}
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
          defaultValue={existing?.sport ?? planned?.sport ?? ""}
        />
        <span className={styles.fieldHint}>
          Whatever you call it. FitTip keeps your own words.
        </span>
      </div>

      {choices.length === 1 ? (
        <>
          <input type="hidden" name="status" value={choices[0].value} />
          <p className={styles.fieldHint} data-log-fixed-outcome>
            {choices[0].hint} It is recorded as {choices[0].label.toLowerCase()}{" "}
            training, with no planned session attached.
          </p>
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
        <ReplacedBy
          options={unplannedOptions}
          linkedId={existing?.replacedById ?? null}
          legacyText={existing?.replacementDescription ?? null}
          sessionSport={planned?.sport ?? ""}
        />
      ) : null}

      <div className={styles.field}>
        <label htmlFor="log-date">Date</label>
        <input
          id="log-date"
          name="actualLocalDate"
          type="date"
          required
          max={today}
          value={actualDate}
          onChange={(event) => setActualDate(event.target.value)}
        />
        <span className={styles.fieldHint}>
          The day the training happened, on your own calendar. Training cannot
          be logged before it happens, so this stops at today.
        </span>
      </div>

      {askWhichDay && planned !== null ? (
        <fieldset className={styles.dayChoice} data-log-day-choice>
          <legend>This session is planned for {planned.dayLabel}</legend>
          <label>
            <input type="radio" name="dayChoice" value="instead" required />
            <span>
              <strong>Instead of {planned.dayLabel}&rsquo;s session</strong>
              <span className={styles.fieldHint}>
                {planned.dayLabel} shows it as logged on this date.
              </span>
            </span>
          </label>
          <label>
            <input type="radio" name="dayChoice" value="extra" required />
            <span>
              <strong>
                Extra &mdash; I&rsquo;ll still do {planned.dayLabel}
              </strong>
              <span className={styles.fieldHint}>
                Saved as its own unplanned log. {planned.dayLabel} stays
                planned.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {discarded.length === 0 ? null : (
        <p className={styles.warning} data-log-clears role="status">
          Saving this as {COMPLETION_OUTCOME_LABELS[outcome].toLowerCase()}{" "}
          removes {listPhrase(discarded)}. Your note and anything you reported
          stay.
        </p>
      )}

      {skipped || outcome === "replaced" ? null : (
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

      <ActualActivities
        activities={planned?.activities ?? []}
        recorded={existing?.activities}
        sessionSport={planned?.sport ?? existing?.sport ?? ""}
        inactive={!activitiesHappened}
      />

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

/**
 * What a replaced session was replaced by: training logged now, in this same
 * save, or training already logged. The owner decided on 25 September 2026
 * that a replaced session must point at one or the other, since without it a
 * replaced session is only a skipped one.
 *
 * The numbers belong here rather than on the planned log, because they
 * describe what was actually done. The planned log keeps its date, note and
 * anything reported. A log written before the link keeps the text it was
 * written with, shown and sent back unchanged beside whatever it now points
 * at.
 */
function ReplacedBy({
  options,
  linkedId,
  legacyText,
  sessionSport,
}: {
  options: LogUnplannedOption[];
  linkedId: string | null;
  legacyText: string | null;
  sessionSport: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">(
    linkedId !== null && options.some((option) => option.id === linkedId)
      ? "existing"
      : "new",
  );
  return (
    <fieldset className={styles.activities} data-log-replaced-by>
      <legend>What you did instead</legend>
      {legacyText === null ? null : (
        <>
          <p className={styles.fieldHint}>
            You wrote: &ldquo;{legacyText}&rdquo;. That stays; point it at the
            training it describes.
          </p>
          <input
            type="hidden"
            name="replacementDescription"
            value={legacyText}
          />
        </>
      )}
      <label className={styles.checkField}>
        <input
          type="radio"
          name="replacementMode"
          value="new"
          checked={mode === "new"}
          onChange={() => setMode("new")}
        />
        <span>Log it now</span>
      </label>
      <label className={styles.checkField}>
        <input
          type="radio"
          name="replacementMode"
          value="existing"
          checked={mode === "existing"}
          disabled={options.length === 0}
          onChange={() => setMode("existing")}
        />
        <span>I already logged it</span>
      </label>
      {options.length === 0 ? (
        <p className={styles.fieldHint}>
          Nothing unplanned is logged from the week before this session to
          today, so log it now.
        </p>
      ) : null}

      {mode === "existing" && options.length > 0 ? (
        <div className={styles.field}>
          <label htmlFor="log-replaced-by">Which training</label>
          <select
            id="log-replaced-by"
            name="replacedByCompletionId"
            defaultValue={linkedId ?? options[0].id}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <label htmlFor="log-replacement-title">Title of what you did</label>
            <input
              id="log-replacement-title"
              name="replacement.title"
              type="text"
              required
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="log-replacement-sport">Sport of what you did</label>
            <input
              id="log-replacement-sport"
              name="replacement.sport"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <div className={styles.fieldPair}>
            <div className={styles.field}>
              <label htmlFor="log-replacement-duration">
                Duration (minutes)
              </label>
              <input
                id="log-replacement-duration"
                name="replacement.durationMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={10080}
                step={1}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="log-replacement-effort">Effort (1-10)</label>
              <input
                id="log-replacement-effort"
                name="replacement.perceivedEffort"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                step={1}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="log-replacement-feeling">How it felt</label>
            <select
              id="log-replacement-feeling"
              name="replacement.feeling"
              defaultValue=""
            >
              <option value="">Not recorded</option>
              {COMPLETION_FEELING_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <ActualActivities
            name="replacement.activities"
            activities={[]}
            sessionSport={sessionSport}
          />
        </>
      )}
    </fieldset>
  );
}
