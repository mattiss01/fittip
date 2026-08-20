"use client";

import { useRef, useState } from "react";

import { RecurrenceFields } from "./recurrence-fields";
import type { PlanActionState } from "./action-state";
import type {
  SeriesActionState,
  SeriesSkippedDate,
} from "./series-action-state";
import { seriesOccurrenceDates } from "./series-recurrence";
import { SessionFields } from "./session-fields";
import styles from "./plan.module.css";

import { shiftIsoDate } from "@/lib/date/local-date";

type FormAction = (formData: FormData) => void;

type Preview = {
  dates: string[];
  openEnded: boolean;
  seriesSubmission: number;
};

export function CreateSession({
  dates,
  expectedRevision,
  planAction,
  planState,
  planPending,
  seriesAction,
  seriesState,
  seriesPending,
}: {
  dates: string[];
  expectedRevision: number;
  planAction: FormAction;
  planState: PlanActionState;
  planPending: boolean;
  seriesAction: FormAction;
  seriesState: SeriesActionState;
  seriesPending: boolean;
}) {
  const [repeat, setRepeat] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = repeat ? seriesPending : planPending;
  const resetKey = useCreateResetKey(planState, seriesState);
  const reviewedPreview =
    preview?.seriesSubmission === seriesState.submission ? preview : null;

  function invalidatePreview() {
    setPreview(null);
    setPreviewError(null);
  }

  function reviewOccurrences() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const values = new FormData(form);
    const frequency = values.get("frequency");
    const intervalCount = Number(values.get("intervalCount"));
    const noEnd = values.get("noEnd") === "true";
    const selectedEnd = noEnd ? undefined : values.get("endDate");
    const weekdays = values
      .getAll("weekdays")
      .map(Number)
      .filter(Number.isInteger);
    if (
      (frequency !== "daily" && frequency !== "weekly") ||
      (selectedEnd !== undefined && typeof selectedEnd !== "string") ||
      !Number.isInteger(intervalCount) ||
      (frequency === "weekly" && weekdays.length === 0)
    ) {
      setPreviewError(
        frequency === "weekly" && weekdays.length === 0
          ? "Choose at least one weekday before reviewing."
          : "Check the recurrence before reviewing.",
      );
      return;
    }
    const searchEnd = selectedEnd ?? shiftIsoDate(selectedDate, 3700);
    const occurrenceDates = seriesOccurrenceDates(
      {
        frequency,
        intervalCount,
        ...(frequency === "weekly" ? { weekdays } : {}),
        startDate: selectedDate,
        ...(selectedEnd === undefined ? {} : { endDate: selectedEnd }),
      },
      selectedDate,
      searchEnd,
      5,
    );
    if (occurrenceDates.length === 0) {
      setPreviewError(
        "This rule has no occurrence in its date range. Change the dates or weekdays.",
      );
      return;
    }
    setPreviewError(null);
    setPreview({
      dates: occurrenceDates,
      openEnded: noEnd,
      seriesSubmission: seriesState.submission,
    });
  }

  return (
    <details className={styles.createSession}>
      <summary>Create session</summary>
      <form
        ref={formRef}
        key={resetKey}
        className={styles.seriesForm}
        action={repeat ? seriesAction : planAction}
      >
        <input
          type="hidden"
          name="operation"
          value={repeat ? "add_series" : "add"}
        />
        <input type="hidden" name="startDate" value={selectedDate} />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <div className={styles.field}>
          <label htmlFor="create-session-date">Date</label>
          <input
            id="create-session-date"
            name="localDate"
            type="date"
            min={dates[0]}
            max={dates[dates.length - 1]}
            required
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              invalidatePreview();
            }}
          />
        </div>
        <SessionFields
          idPrefix="create-session"
          draft={planState.operation === "add" ? planState.draft : undefined}
        />

        <label className={styles.checkField}>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(event) => {
              setRepeat(event.target.checked);
              invalidatePreview();
            }}
          />
          <span>Repeat this session</span>
        </label>

        {repeat ? (
          <RecurrenceFields
            idPrefix="create-session-recurrence"
            startDate={selectedDate}
            onRuleChange={invalidatePreview}
          />
        ) : null}

        {previewError === null ? null : (
          <p className={styles.inlineError} role="alert">
            {previewError}
          </p>
        )}

        {!repeat ? (
          <button className={styles.primary} type="submit" disabled={pending}>
            Create session
          </button>
        ) : reviewedPreview === null ? (
          <button
            className={styles.primary}
            type="button"
            onClick={reviewOccurrences}
            disabled={pending}
          >
            Review recurring sessions
          </button>
        ) : (
          <section
            className={styles.reviewCard}
            aria-labelledby="create-review-title"
          >
            <p className={styles.sectionLabel}>Review before saving</p>
            <h2 id="create-review-title">First occurrences</h2>
            <ol className={styles.previewDates}>
              {reviewedPreview.dates.map((date) => (
                <li key={date}>{stampDate(date)}</li>
              ))}
            </ol>
            <p className={styles.consequenceStandalone}>
              {reviewedPreview.openEnded
                ? "This series has no end date. FitTip creates only the current fourteen-day window and extends it on later Plan visits."
                : "The series stops on the end date you chose."}{" "}
              If a date already has ten sessions, that date is skipped and named
              after the save.
            </p>
            <div className={styles.reviewActions}>
              <button
                className={styles.action}
                type="button"
                onClick={invalidatePreview}
                disabled={pending}
              >
                Change recurrence
              </button>
              <button
                className={styles.primary}
                type="submit"
                disabled={pending}
              >
                Create recurring sessions
              </button>
            </div>
          </section>
        )}
      </form>

      <SkippedDates
        skipped={
          seriesState.operation === "add_series"
            ? (seriesState.skipped ?? [])
            : []
        }
      />
    </details>
  );
}

function useCreateResetKey(
  planState: PlanActionState,
  seriesState: SeriesActionState,
) {
  const targetedPlan = planState.operation === "add";
  const targetedSeries =
    seriesState.operation === "add_series" && seriesState.status === "saved";
  const [seen, setSeen] = useState({ plan: 0, series: 0 });
  const next = {
    plan: targetedPlan ? planState.submission : seen.plan,
    series: targetedSeries ? seriesState.submission : seen.series,
  };
  if (next.plan !== seen.plan || next.series !== seen.series) setSeen(next);
  return `plan-${next.plan}-series-${next.series}`;
}

function SkippedDates({ skipped }: { skipped: SeriesSkippedDate[] }) {
  if (skipped.length === 0) return null;
  return (
    <section
      className={styles.skippedCard}
      aria-labelledby="create-skipped-title"
    >
      <h2 id="create-skipped-title">Dates not added</h2>
      <ul>
        {skipped.map((item) => (
          <li key={item.occurrenceDate + "-" + item.reason}>
            {stampDate(item.occurrenceDate)} â€”{" "}
            {item.reason === "daily-session-limit"
              ? "already has ten sessions"
              : "will be tried on the next Plan visit"}
          </li>
        ))}
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
