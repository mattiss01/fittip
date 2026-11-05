"use client";

import { useState } from "react";

import { CancelReasonFields } from "./cancel-reason-fields";
import type { FillProposal } from "./fill/fill-state";
import { RecurrenceFields, recurrenceProblem } from "./recurrence-fields";
import type { SeriesActionState } from "./series-action-state";
import { seriesOccurrenceDates } from "./series-recurrence";
import { SessionFields } from "./session-fields";
import styles from "./plan.module.css";

import type { ActivityValue } from "@/components/training/activity-editor";
import { shiftIsoDate } from "@/lib/date/local-date";

export type PlanSeriesView = {
  id: string;
  frequency: "daily" | "weekly";
  intervalCount: number;
  weekdays: number[];
  startDate: string;
  endDate: string | null;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  startTime: string | null;
  note: string | null;
  coachNote: string | null;
};

export type RecurringSessionView = {
  id: string;
  occurrenceDate: string;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  startTime: string | null;
  note: string | null;
  coachNote: string | null;
  activities: ActivityValue[];
  /** A coach's suggestion for this occurrence still waiting for an answer. */
  openFill?: FillProposal;
};

type PlanFormAction = (formData: FormData) => void;

/**
 * Whether this occurrence's rule date still lies ahead inside its own segment.
 *
 * Two separate things hang on exactly this condition, so they read one
 * function rather than two copies that can drift apart:
 *
 *   * the series-wide removal control below is offered only when it holds -
 *     outside it the bulk removal would change nothing;
 *   * it is also the condition under which `materialize_rolling_plan_series`
 *     will write a deleted occurrence back. The materializer fills only
 *     `today .. today + 90` and only between a segment's own dates, so once a
 *     moved occurrence's rule date falls behind today, deleting it keeps it
 *     deleted.
 *
 * The Delete warning on the session page is the second caller. It matters
 * that the two agree: the warning quotes the removal control by name, and must
 * not name a control the same predicate has withheld.
 *
 * It is a slight over-estimate of the refill, not an under-estimate: a rule
 * date inside the window can still fail to refill if that date already holds
 * ten sessions. That errs toward warning the owner that a delete may not
 * stick, which is the safe direction for a destructive control.
 */
export function occurrenceHasFutureRuleDate(
  occurrenceDate: string,
  series: Pick<PlanSeriesView, "startDate" | "endDate">,
  today: string,
) {
  return (
    occurrenceDate >= series.startDate &&
    (series.endDate === null || occurrenceDate <= series.endDate) &&
    occurrenceDate >= today
  );
}

export function RecurringSessionControls({
  mode,
  today,
  session,
  series,
  expectedRevision,
  planAction,
  planPending,
  seriesAction,
  seriesPending,
}: {
  mode: "edit" | "remove";
  today: string;
  session: RecurringSessionView;
  series: PlanSeriesView;
  expectedRevision: number;
  planAction: PlanFormAction;
  planPending: boolean;
  seriesAction: PlanFormAction;
  seriesPending: boolean;
}) {
  const canChangeFuture = occurrenceHasFutureRuleDate(
    session.occurrenceDate,
    series,
    today,
  );
  const canEditWhole =
    canChangeFuture &&
    series.startDate >= today &&
    seriesOccurrenceDates(
      {
        ...series,
        endDate: series.endDate ?? undefined,
        weekdays: series.weekdays,
      },
      series.startDate,
      shiftIsoDate(session.occurrenceDate, -1),
      1,
    ).length === 0;
  if (mode === "edit") {
    return (
      <RecurringEditForm
        session={session}
        series={series}
        expectedRevision={expectedRevision}
        canChangeFuture={canChangeFuture}
        canEditWhole={canEditWhole}
        planAction={planAction}
        seriesAction={seriesAction}
        pending={planPending || seriesPending}
      />
    );
  }

  return (
    <>
      <section className={styles.scope}>
        <h4>Only this session</h4>
        <p className={styles.consequenceStandalone}>
          Cancels only this occurrence and keeps it on the record as cancelled.
          The recurring rule and every other occurrence stay.
        </p>
        <form className={styles.form} action={planAction}>
          <input type="hidden" name="operation" value="cancel" />
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            type="hidden"
            name="expectedRevision"
            value={expectedRevision}
          />
          <CancelReasonFields idPrefix={`cancel-${session.id}`} />
          <button
            className={styles.action}
            type="submit"
            disabled={planPending}
          >
            Cancel only this session
          </button>
        </form>
      </section>
    </>
  );
}

/**
 * Editing an occurrence asks for the scope last, as a calendar does (owner,
 * 5 Nov 2026): the fields are filled in once, Save asks "only this one or
 * this and following", and each choice says in a line what it leaves alone.
 * A changed repeat only means something from here on, so once the repeat is
 * touched "Only this session" is not offered.
 *
 * The form opens with this occurrence's content, which is what its card
 * shows; the future scope makes that the template from here on.
 */
function RecurringEditForm({
  session,
  series,
  expectedRevision,
  canChangeFuture,
  canEditWhole,
  planAction,
  seriesAction,
  pending,
}: {
  session: RecurringSessionView;
  series: PlanSeriesView;
  expectedRevision: number;
  canChangeFuture: boolean;
  canEditWhole: boolean;
  planAction: PlanFormAction;
  seriesAction: PlanFormAction;
  pending: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const [ruleChanged, setRuleChanged] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const ruleStart = canEditWhole ? series.startDate : session.occurrenceDate;
  const scopeTitle = `scope-${session.id}`;
  // Each submit sets its own operation inside its own `formAction`: React
  // drops a submitter's name and value whenever the submitter carries one,
  // so `name`/`value` would never arrive.
  const onlyThis = (formData: FormData) => {
    formData.set("operation", "edit");
    planAction(formData);
  };

  return (
    <form className={styles.form}>
      {/* Enter in a field submits with the form's first button. A disabled
          first button makes Enter do nothing, so no scope is ever chosen by a
          keystroke meant for a field. */}
      <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />
      <input type="hidden" name="sessionId" value={session.id} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <SessionFields
        idPrefix={"series-edit-" + session.id}
        draft={draftOf(session)}
        activities={session.activities}
        fill={{ sessionId: session.id, open: session.openFill }}
      />
      {canChangeFuture ? (
        <RecurrenceFields
          idPrefix={"series-edit-" + session.id}
          startDate={ruleStart}
          initial={{
            frequency: series.frequency,
            intervalCount: series.intervalCount,
            weekdays: series.weekdays,
            ...(series.endDate === null ? {} : { endDate: series.endDate }),
          }}
          onRuleChange={() => {
            setRuleChanged(true);
            setRuleError(null);
          }}
        />
      ) : (
        // The predicate withholds the future scope both when the occurrence
        // lies outside its segment's dates and when its rule date has fallen
        // behind today, so the copy names neither cause alone.
        <p className={styles.consequence}>
          This occurrence is no longer on a date its series repeats from, so
          only this session can be changed.
        </p>
      )}

      {!canChangeFuture ? (
        <button
          className={styles.primary}
          type="submit"
          formAction={onlyThis}
          disabled={pending}
        >
          Save changes
        </button>
      ) : !choosing ? (
        <button
          className={styles.primary}
          type="button"
          onClick={() => setChoosing(true)}
          disabled={pending}
        >
          Save changes
        </button>
      ) : (
        <section className={styles.scopeSheet} aria-labelledby={scopeTitle}>
          <h4 id={scopeTitle}>Save changes to {session.title}</h4>
          {ruleChanged ? (
            <p className={styles.consequenceStandalone}>
              You changed how it repeats, which applies from this session on.
            </p>
          ) : (
            <button
              className={styles.scopeChoice}
              type="submit"
              formAction={onlyThis}
              disabled={pending}
            >
              <strong>Only this session</strong>
              <span>
                {shortDate(session.occurrenceDate)} becomes a one-off change;
                the series never overwrites it.
              </span>
            </button>
          )}
          <button
            className={styles.scopeChoice}
            type="submit"
            onClick={(event) => {
              const form = event.currentTarget.form;
              const problem =
                form === null
                  ? null
                  : recurrenceProblem(new FormData(form), ruleStart);
              setRuleError(problem);
              if (problem !== null) event.preventDefault();
            }}
            formAction={(formData: FormData) => {
              formData.set("operation", "edit_series");
              seriesAction(formData);
            }}
            disabled={pending}
          >
            <strong>
              {canEditWhole ? "The whole series" : "This and following"}
            </strong>
            <span>
              {canEditWhole
                ? "Every session of it, since none has passed yet. Logged training stays as it is."
                : `From ${shortDate(session.occurrenceDate)} on. Earlier sessions, one-off changes before this date, and logged training stay as they are.`}
            </span>
          </button>
          {ruleError === null ? null : (
            <p className={styles.inlineError} role="alert">
              {ruleError}
            </p>
          )}
          <button
            className={styles.action}
            type="button"
            onClick={() => setChoosing(false)}
            disabled={pending}
          >
            Back to editing
          </button>
        </section>
      )}
    </form>
  );
}

function shortDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

/**
 * The two scopes of a delete on an occurrence, in the same shape as Edit and
 * Cancel. Both are permanent: since M3-20 the series records a deleted date and
 * leaves it empty, and ending the series from a date removes the rest.
 */
export function RecurringDeleteControls({
  today,
  sessionId,
  occurrenceDate,
  series,
  expectedRevision,
  planAction,
  planPending,
  seriesAction,
  seriesState,
  seriesPending,
}: {
  today: string;
  sessionId: string;
  occurrenceDate: string;
  series: PlanSeriesView;
  expectedRevision: number;
  planAction: PlanFormAction;
  planPending: boolean;
  seriesAction: PlanFormAction;
  seriesState: SeriesActionState;
  seriesPending: boolean;
}) {
  const canChangeFuture = occurrenceHasFutureRuleDate(
    occurrenceDate,
    series,
    today,
  );

  return (
    <>
      <section className={styles.scope}>
        <h4>Only this session</h4>
        <p className={styles.permanentConsequence}>
          Permanent. Deletes only this occurrence and does not keep it on the
          record. The series will not write this date back, and every other
          occurrence stays. A session you have logged training against cannot be
          deleted. There is no undo.
        </p>
        <form className={styles.form} action={planAction}>
          <input type="hidden" name="operation" value="delete" />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input
            type="hidden"
            name="expectedRevision"
            value={expectedRevision}
          />
          <button
            className={styles.dangerAction}
            type="submit"
            disabled={planPending}
          >
            Delete only this session
          </button>
        </form>
      </section>

      {canChangeFuture ? (
        <section className={styles.scope}>
          <h4>This and all future sessions</h4>
          <p className={styles.permanentConsequence}>
            Permanent. Removes this occurrence and every later one of this
            series, including changed and cancelled ones, and the series stops.
            A session with training logged against it is kept. Nothing before
            this date changes, completed training is untouched, and there is no
            undo.
          </p>
          <form className={styles.form} action={seriesAction}>
            <input type="hidden" name="operation" value="end_series" />
            <input type="hidden" name="sessionId" value={sessionId} />
            <input
              type="hidden"
              name="expectedRevision"
              value={expectedRevision}
            />
            <button
              className={styles.dangerAction}
              type="submit"
              disabled={seriesPending}
            >
              Delete this and all future sessions
            </button>
          </form>
        </section>
      ) : (
        <p className={styles.consequence}>
          Its series no longer fills this date, so only this session can be
          deleted.
        </p>
      )}
      {seriesState.sessionId === sessionId &&
      seriesState.status === "validation" ? (
        <p className={styles.consequence}>{seriesState.message}</p>
      ) : null}
    </>
  );
}

function draftOf(
  value: Pick<
    RecurringSessionView | PlanSeriesView,
    | "title"
    | "sport"
    | "intent"
    | "expectedDurationMinutes"
    | "startTime"
    | "note"
    | "coachNote"
  >,
) {
  return {
    title: value.title,
    sport: value.sport,
    intent: value.intent ?? "",
    expectedDurationMinutes:
      value.expectedDurationMinutes === null
        ? ""
        : String(value.expectedDurationMinutes),
    startTime: value.startTime ?? "",
    note: value.note ?? "",
    coachNote: value.coachNote ?? "",
  };
}
