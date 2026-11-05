"use client";

import { useState, type FormEvent } from "react";

import { RecurrenceFields, recurrenceProblem } from "./recurrence-fields";
import type { PlanActionState } from "./action-state";
import {
  summarizeSkippedDates,
  type SeriesSkippedDate,
} from "./series-action-state";
import { SessionFields } from "./session-fields";
import styles from "./plan.module.css";

import type { SavedSessionOption } from "@/components/training/saved-session-picker";

type FormAction = (formData: FormData) => void;

/**
 * The one session editor, for one date (R3a): a day's "+" opens it in a
 * sheet, so the date is the day's and not a field. Any repeat other than
 * "Doesn't repeat" turns the same form into a series starting there; the
 * repeat picker is withheld on a day past the dates recurring sessions are
 * written through (R3b-3), where a series could not start. `startFrom` is a
 * saved session picked in the sheet; its values are copied, nothing links
 * back.
 */
export function CreateSession({
  date,
  canRepeat,
  startFrom,
  expectedRevision,
  planAction,
  planState,
  planPending,
  seriesAction,
  seriesPending,
}: {
  date: string;
  /** False on a day past the dates a series may start on. */
  canRepeat: boolean;
  startFrom?: SavedSessionOption;
  expectedRevision: number;
  planAction: FormAction;
  planState: PlanActionState;
  planPending: boolean;
  seriesAction: FormAction;
  seriesPending: boolean;
}) {
  const [repeat, setRepeat] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  // A refused save re-seeds the fields from what was sent; a refusal from an
  // earlier opening of the sheet does not.
  const [openedAt] = useState(planState.submission);
  const refusedDraft =
    planState.operation === "add" &&
    planState.status !== "saved" &&
    planState.submission > openedAt
      ? planState.draft
      : undefined;
  const pending = repeat ? seriesPending : planPending;

  // The picker lists the next dates as the rule changes, so there is no
  // separate review (owner, 5 Nov 2026). A rule with no date at all is stopped
  // here, before the action: the action refuses it too, but the form is
  // emptied on the way.
  function checkRule(event: FormEvent<HTMLFormElement>) {
    if (!repeat) return;
    const message = recurrenceProblem(new FormData(event.currentTarget), date);
    setRuleError(message);
    if (message !== null) event.preventDefault();
  }

  return (
    <form
      className={styles.seriesForm}
      action={repeat ? seriesAction : planAction}
      onSubmit={checkRule}
      data-create-session
    >
      <input
        type="hidden"
        name="operation"
        value={repeat ? "add_series" : "add"}
      />
      <input type="hidden" name="localDate" value={date} />
      <input type="hidden" name="startDate" value={date} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      {startFrom === undefined ? null : (
        <p className={styles.fieldHint} role="status">
          Started from {startFrom.title}. Change anything that was different;
          the saved session keeps its own.
        </p>
      )}
      <SessionFields
        idPrefix="create-session"
        draft={
          startFrom !== undefined
            ? {
                title: startFrom.title,
                sport: startFrom.sport,
                intent: startFrom.intent ?? "",
                expectedDurationMinutes:
                  startFrom.expectedDurationMinutes?.toString() ?? "",
                // A saved session is a template, not a day: it has no time.
                startTime: "",
                note: startFrom.note ?? "",
                coachNote: "",
              }
            : refusedDraft
        }
        activities={startFrom?.activities}
      />

      {canRepeat ? (
        <RecurrenceFields
          idPrefix="create-session-recurrence"
          startDate={date}
          repeats={repeat}
          onRepeatsChange={setRepeat}
          onRuleChange={() => setRuleError(null)}
        />
      ) : null}

      {ruleError === null ? null : (
        <p className={styles.inlineError} role="alert">
          {ruleError}
        </p>
      )}

      <button className={styles.primary} type="submit" disabled={pending}>
        {repeat ? "Create recurring sessions" : "Create session"}
      </button>
    </form>
  );
}

export function SkippedDates({ skipped }: { skipped: SeriesSkippedDate[] }) {
  if (skipped.length === 0) return null;
  const { fullDates, waiting } = summarizeSkippedDates(skipped);
  return (
    <section
      className={styles.skippedCard}
      aria-labelledby="create-skipped-title"
    >
      <h2 id="create-skipped-title">Dates not added</h2>
      <ul>
        {fullDates.map((date) => (
          <li key={date}>{stampDate(date)} — already has ten sessions</li>
        ))}
        {waiting === 0 ? null : (
          <li>
            {waiting} more recurring {waiting === 1 ? "session" : "sessions"}{" "}
            will be tried on the next Plan visit
          </li>
        )}
      </ul>
    </section>
  );
}

function stampDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate + "T12:00:00.000Z"));
}
