"use client";

import { startTransition, useRef, useState } from "react";

import { CancelReasonFields } from "./cancel-reason-fields";
import type { FillProposal } from "./fill/fill-state";
import { PlanDateInput, type PlanDateRange } from "./plan-date-field";
import { SheetCloseButton, SheetLayer } from "./plan-sheet";
import { appendRule, shortDate } from "./recurrence-fields";
import { RepeatRow, RepeatSheet, ruleOf } from "./repeat-sheet";
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
  /** The day it is on, which a move may have taken off its rule date. */
  localDate: string;
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

/**
 * What a change to the series may reach from this occurrence: nothing past
 * it once its rule date is behind it, otherwise this and following, or the
 * whole series when nothing of it comes before this one and it has not begun.
 */
export function seriesEditScope(
  occurrenceDate: string,
  series: PlanSeriesView,
  today: string,
) {
  const canChangeFuture = occurrenceHasFutureRuleDate(
    occurrenceDate,
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
      shiftIsoDate(occurrenceDate, -1),
      1,
    ).length === 0;
  return { canChangeFuture, canEditWhole };
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
  dateRange,
}: {
  mode: "edit" | "remove";
  today: string;
  session: RecurringSessionView;
  series: PlanSeriesView;
  expectedRevision: number;
  /** Where a single session may be placed; the edit form's date field. */
  dateRange?: PlanDateRange;
  planAction: PlanFormAction;
  planPending: boolean;
  seriesAction: PlanFormAction;
  seriesPending: boolean;
}) {
  const { canChangeFuture, canEditWhole } = seriesEditScope(
    session.occurrenceDate,
    series,
    today,
  );
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
        dateRange={dateRange}
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
 * 5 Nov 2026): the fields are filled in once, and Save asks "only this one or
 * this and following" in a dialog that holds everything else still until it
 * is answered. The repeat is not a field here: its row opens a sheet of its
 * own, which saves the whole form from this session on, because a changed
 * repeat means nothing for one session alone.
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
  dateRange,
}: {
  session: RecurringSessionView;
  series: PlanSeriesView;
  expectedRevision: number;
  canChangeFuture: boolean;
  canEditWhole: boolean;
  planAction: PlanFormAction;
  seriesAction: PlanFormAction;
  pending: boolean;
  dateRange?: PlanDateRange;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState<"repeat" | "scope" | null>(null);
  // A series has no date to move to, so a session moved to another day can
  // only be saved as itself (owner, 5 Nov 2026: the date is a field here too).
  const [moved, setMoved] = useState(false);
  const isMoved = () =>
    formRef.current !== null &&
    new FormData(formRef.current).get("localDate") !== session.localDate;
  const rule = ruleOf(series);
  const scopeTitle = `scope-${session.id}`;
  const from = shortDate(session.occurrenceDate);
  // Everything the form holds, as the given operation. The dialog and the
  // sheet are portalled out of the form, so they send it themselves.
  const send = (
    operation: "edit" | "edit_series",
    action: PlanFormAction,
    ruleData?: FormData,
  ) => {
    const form = formRef.current;
    if (form === null) return;
    const formData = new FormData(form);
    formData.set("operation", operation);
    if (ruleData) {
      for (const [key, value] of ruleData) formData.append(key, value);
    } else if (operation === "edit_series") {
      appendRule(formData, rule);
    }
    setOpen(null);
    startTransition(() => action(formData));
  };

  return (
    <form className={styles.form} ref={formRef}>
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
        dateField={
          dateRange === undefined ? undefined : (
            <PlanDateInput
              label="Date"
              // Within its own series' dates, which is where the plan lets
              // an occurrence go.
              range={{
                first:
                  series.startDate > dateRange.first
                    ? series.startDate
                    : dateRange.first,
                last:
                  series.endDate !== null && series.endDate < dateRange.last
                    ? series.endDate
                    : dateRange.last,
              }}
              defaultValue={session.localDate}
            />
          )
        }
      />
      {canChangeFuture ? (
        <RepeatRow
          rule={rule}
          disabled={pending}
          onOpen={() => setOpen("repeat")}
        />
      ) : (
        <>
          <RepeatRow rule={rule} />
          {/* The predicate withholds the future scope both when the
              occurrence lies outside its segment's dates and when its rule
              date has fallen behind today, so the copy names neither cause
              alone. */}
          <p className={styles.consequence}>
            This occurrence is no longer on a date its series repeats from, so
            its repeat cannot change and only this session can be changed.
          </p>
        </>
      )}

      {canChangeFuture ? (
        <button
          className={styles.primary}
          type="button"
          onClick={() => {
            // The dialog makes the form inert, where the browser could not
            // point at a field it refuses, so the fields are checked first.
            if (formRef.current?.reportValidity() === false) return;
            setMoved(isMoved());
            setOpen("scope");
          }}
          disabled={pending}
        >
          Save changes
        </button>
      ) : (
        <button
          className={styles.primary}
          type="submit"
          formAction={(formData: FormData) => {
            // React drops a submitter's name and value whenever it carries
            // its own `formAction`, so the operation is set here.
            formData.set("operation", "edit");
            planAction(formData);
          }}
          disabled={pending}
        >
          Save changes
        </button>
      )}

      {open === "repeat" ? (
        <RepeatSheet
          idPrefix={"series-repeat-" + session.id}
          series={series}
          occurrenceDate={session.occurrenceDate}
          canEditWhole={canEditWhole}
          withEdits
          pending={pending}
          checkBefore={() =>
            formRef.current?.checkValidity() === false
              ? "Some of the session's own fields need fixing first. Cancel, check them, then change the repeat."
              : isMoved()
                ? "You moved this session to another day, which saves it alone. Cancel, save that first, then change the repeat."
                : null
          }
          onSave={(ruleData) => send("edit_series", seriesAction, ruleData)}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open === "scope" ? (
        <SheetLayer
          view="scope"
          placement="center"
          labelledBy={scopeTitle}
          onClose={() => setOpen(null)}
        >
          <div className={styles.scopeDialog}>
            <h2 id={scopeTitle}>Save changes to {session.title}</h2>
            <button
              className={styles.scopeChoice}
              type="button"
              onClick={() => send("edit", planAction)}
              disabled={pending}
            >
              <strong>Only this session</strong>
              <span>
                {from} becomes a one-off change; the series never overwrites it.
              </span>
            </button>
            {moved ? (
              <p className={styles.consequenceStandalone}>
                You moved it to another day, so this saves this session only.
              </p>
            ) : (
              <button
                className={styles.scopeChoice}
                type="button"
                onClick={() => send("edit_series", seriesAction)}
                disabled={pending}
              >
                <strong>
                  {canEditWhole ? "The whole series" : "This and following"}
                </strong>
                <span>
                  {canEditWhole
                    ? "Every session of it, starting with this first one. Logged training stays as it is."
                    : `From ${from} on. Earlier sessions, one-off changes before this date, and logged training stay as they are.`}
                </span>
              </button>
            )}
            <SheetCloseButton className={styles.action}>
              Back to editing
            </SheetCloseButton>
          </div>
        </SheetLayer>
      ) : null}
    </form>
  );
}

/**
 * The two scopes of a delete on an occurrence, as two buttons and nothing
 * else (owner, 5 Nov 2026: the dialog's title and the buttons say it). Both are
 * permanent: since M3-20 the series records a deleted date and leaves it
 * empty, and ending the series from a date removes the rest, keeping any
 * session with training logged against it.
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
      <form className={styles.form} action={planAction}>
        <input type="hidden" name="operation" value="delete" />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <button
          className={styles.dangerAction}
          type="submit"
          disabled={planPending}
        >
          Delete only this session
        </button>
      </form>

      {canChangeFuture ? (
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
