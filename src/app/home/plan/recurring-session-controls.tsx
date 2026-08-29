"use client";

import { RecurrenceFields } from "./recurrence-fields";
import type { SeriesActionState } from "./series-action-state";
import { seriesOccurrenceDates } from "./series-recurrence";
import { SessionFields } from "./session-fields";
import styles from "./plan.module.css";

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
};

type PlanFormAction = (formData: FormData) => void;

export function RecurringSessionControls({
  mode,
  today,
  session,
  series,
  expectedRevision,
  planAction,
  planPending,
  seriesAction,
  seriesState,
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
  seriesState: SeriesActionState;
  seriesPending: boolean;
}) {
  const occurrenceInsideSegment =
    session.occurrenceDate >= series.startDate &&
    (series.endDate === null || session.occurrenceDate <= series.endDate);
  const canChangeFuture =
    occurrenceInsideSegment && session.occurrenceDate >= today;
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
    return (
      <>
        <section className={styles.scope}>
          <h4>Only this session</h4>
          <p className={styles.consequenceStandalone}>
            Changes this occurrence only. It becomes visibly changed and the
            recurring rule never overwrites it.
          </p>
          <form className={styles.form} action={planAction}>
            <input type="hidden" name="operation" value="edit" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input
              type="hidden"
              name="expectedRevision"
              value={expectedRevision}
            />
            <SessionFields
              idPrefix={"series-only-" + session.id}
              draft={draftOf(session)}
            />
            <button
              className={styles.primary}
              type="submit"
              disabled={planPending}
            >
              Change only this session
            </button>
          </form>
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
            <form className={styles.form} action={seriesAction}>
              <input type="hidden" name="operation" value="edit_series" />
              <input type="hidden" name="sessionId" value={session.id} />
              <input
                type="hidden"
                name="expectedRevision"
                value={expectedRevision}
              />
              <SessionFields
                idPrefix={"series-future-" + session.id}
                draft={draftOf(series)}
              />
              <RecurrenceFields
                idPrefix={"series-future-" + session.id}
                startDate={
                  canEditWhole ? series.startDate : session.occurrenceDate
                }
                initial={defaultRule}
              />
              <button
                className={styles.primary}
                type="submit"
                disabled={seriesPending}
              >
                Change this and future sessions
              </button>
            </form>
          </section>
        ) : (
          <p className={styles.consequence}>
            This occurrence is outside the active dates of its ended series.
            Only this session can be changed.
          </p>
        )}
      </>
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

      {canChangeFuture ? (
        <section className={styles.scope}>
          <h4>This and all future sessions</h4>
          <p className={styles.permanentConsequence}>
            Permanent. Removes this occurrence and every materialized occurrence
            of this series on or after its rule date, including changed
            occurrences. Locked sessions are kept. Nothing before this date
            changes, completed training is untouched, and there is no undo.
            Removed sessions are deleted from the Plan, not cancelled.
          </p>
          <form className={styles.form} action={seriesAction}>
            <input type="hidden" name="operation" value="end_series" />
            <input type="hidden" name="sessionId" value={session.id} />
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
              Remove this and all future sessions
            </button>
          </form>
        </section>
      ) : (
        <p className={styles.consequence}>
          This locked session outlived the series end date. The bulk removal
          would change nothing, so only this session can be cancelled.
        </p>
      )}
      {seriesState.sessionId === session.id &&
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
