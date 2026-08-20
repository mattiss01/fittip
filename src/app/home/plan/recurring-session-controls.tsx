"use client";

import { useActionState } from "react";

import { RecurrenceFields } from "./recurrence-fields";
import { INITIAL_SERIES_ACTION_STATE } from "./series-action-state";
import { changeSeriesAction } from "./series-actions";
import { seriesOccurrenceDates } from "./series-recurrence";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "./series-transition-watch";
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

const RECOVERY_FLAG = "fittip.plan.series-change.recovered:v1";

export function RecurringSessionControls({
  today,
  session,
  series,
  expectedRevision,
  planAction,
  planPending,
}: {
  today: string;
  session: RecurringSessionView;
  series: PlanSeriesView;
  expectedRevision: number;
  planAction: PlanFormAction;
  planPending: boolean;
}) {
  const [state, seriesAction, pending] = useActionState(
    changeSeriesAction,
    INITIAL_SERIES_ACTION_STATE,
  );
  const stall = useSeriesMutationStall(
    pending,
    state.submission,
    RECOVERY_FLAG,
  );
  const recovered = useSeriesRecoveredReload(state.submission, RECOVERY_FLAG);
  const notice =
    seriesStallNotice(stall) ??
    (pending ? "Saving recurring-session change…" : null) ??
    (recovered
      ? "The Plan was reloaded after a recurring-session response was lost. What you see is what is saved."
      : null);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);
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

  return (
    <>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.noticeInline}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice ?? state.message}
      </p>
      {state.status === "conflict" ||
      state.status === "session" ||
      stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/plan">
          Reload the current Plan
        </a>
      ) : null}

      <details className={styles.disclosure}>
        <summary>Change recurring session</summary>
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
                disabled={pending}
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
      </details>

      <details className={styles.disclosure}>
        <summary>Remove recurring session</summary>
        <section className={styles.scope}>
          <h4>Only this session</h4>
          <p className={styles.consequenceStandalone}>
            Cancels only this occurrence and keeps it on the record as
            cancelled. The recurring rule and every other occurrence stay.
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
              Remove only this session
            </button>
          </form>
        </section>

        {canChangeFuture ? (
          <section className={styles.scope}>
            <h4>This and all future sessions</h4>
            <p className={styles.permanentConsequence}>
              Permanent. Removes this occurrence and every materialized
              occurrence of this series on or after its rule date, including
              changed occurrences. Locked sessions are kept. Nothing before this
              date changes, completed training is untouched, and there is no
              undo. Removed sessions are deleted from the Plan, not cancelled.
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
                disabled={pending}
              >
                Remove this and all future sessions
              </button>
            </form>
          </section>
        ) : (
          <p className={styles.consequence}>
            This locked session outlived the series end date. The bulk removal
            would change nothing, so only this session can be removed.
          </p>
        )}
      </details>
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
