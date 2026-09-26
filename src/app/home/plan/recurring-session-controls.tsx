"use client";

import { RecurrenceFields } from "./recurrence-fields";
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
  note: string | null;
};

export type RecurringSessionView = {
  id: string;
  occurrenceDate: string;
  isLocked: boolean;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  activities: ActivityValue[];
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
 *     `today .. today + 13` and only between a segment's own dates, so once a
 *     moved occurrence's rule date falls behind today, deleting it keeps it
 *     deleted.
 *
 * The Delete warning in `plan-manager.tsx` is the second caller. It matters
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
  const defaultRule = {
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    weekdays: series.weekdays,
    ...(series.endDate === null ? {} : { endDate: series.endDate }),
  };

  if (mode === "edit") {
    // One form, two submits. Each button names its own operation and its own
    // action, so the fields are filled in once and the scope is chosen last.
    // The form opens with this occurrence's content, which is what its card
    // shows; the future scope makes that the template from here on.
    return (
      <form className={styles.form} action={planAction}>
        <input type="hidden" name="sessionId" value={session.id} />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <SessionFields
          idPrefix={"series-edit-" + session.id}
          draft={draftOf(session)}
          activities={session.activities}
        />
        {canChangeFuture ? (
          <RecurrenceFields
            idPrefix={"series-edit-" + session.id}
            startDate={canEditWhole ? series.startDate : session.occurrenceDate}
            initial={defaultRule}
          />
        ) : null}

        <section className={styles.scope}>
          <h4>Only this session</h4>
          <p className={styles.consequenceStandalone}>
            Changes this occurrence only. It becomes visibly changed and the
            recurring rule never overwrites it.
            {canChangeFuture ? " The repeat settings are not used." : ""}
          </p>
          <button
            className={styles.primary}
            type="submit"
            name="operation"
            value="edit"
            disabled={planPending || seriesPending}
          >
            Change only this session
          </button>
        </section>

        {canChangeFuture ? (
          <section className={styles.scope}>
            <h4>This and all future sessions</h4>
            <p className={styles.consequenceStandalone}>
              {canEditWhole
                ? "No occurrence has passed, so this changes the whole series."
                : "This closes the current series segment here and starts its successor."}{" "}
              Earlier occurrences, changed occurrences before this date, and
              completed training stay exactly as they are.
            </p>
            <button
              className={styles.primary}
              type="submit"
              // React drops a submitter's own name and value when the
              // submitter carries a \`formAction\`, so this button names its
              // operation itself rather than through \`name\`/\`value\`.
              formAction={(formData: FormData) => {
                formData.set("operation", "edit_series");
                seriesAction(formData);
              }}
              disabled={planPending || seriesPending}
            >
              Change this and future sessions
            </button>
          </section>
        ) : (
          // The predicate withholds the future scope both when the occurrence
          // lies outside its segment's dates and when its rule date has fallen
          // behind today, so the copy names neither cause alone.
          <p className={styles.consequence}>
            This occurrence is no longer on a date its series repeats from, so
            only this session can be changed.
          </p>
        )}
      </form>
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
            Locked sessions are kept, this one too if it is locked, and so is
            any session with training logged against it. Nothing before this
            date changes, completed training is untouched, and there is no undo.
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
    "title" | "sport" | "intent" | "expectedDurationMinutes" | "note"
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
    note: value.note ?? "",
  };
}
