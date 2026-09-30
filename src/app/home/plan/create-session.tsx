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

import type { SavedSessionOption } from "@/components/training/saved-session-picker";
import { shiftIsoDate } from "@/lib/date/local-date";

type FormAction = (formData: FormData) => void;

type Preview = {
  dates: string[];
  openEnded: boolean;
  seriesSubmission: number;
};

/**
 * The one session editor, for one date (R3a): a day's "+" opens it in a
 * sheet, so the date is the day's and not a field. "Repeat this session"
 * turns the same form into a series starting there. `startFrom` is a saved
 * session picked in the sheet; its values are copied, nothing links back.
 */
export function CreateSession({
  date,
  startFrom,
  expectedRevision,
  planAction,
  planState,
  planPending,
  seriesAction,
  seriesState,
  seriesPending,
}: {
  date: string;
  startFrom?: SavedSessionOption;
  expectedRevision: number;
  planAction: FormAction;
  planState: PlanActionState;
  planPending: boolean;
  seriesAction: FormAction;
  seriesState: SeriesActionState;
  seriesPending: boolean;
}) {
  const [repeat, setRepeat] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // A refused save re-seeds the fields from what was sent; a refusal from an
  // earlier opening of the sheet does not.
  const [openedAt] = useState(planState.submission);
  const refusedDraft =
    planState.operation === "add" &&
    planState.status !== "saved" &&
    planState.submission > openedAt
      ? planState.draft
      : undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const pending = repeat ? seriesPending : planPending;
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
    const searchEnd = selectedEnd ?? shiftIsoDate(date, 3700);
    const occurrenceDates = seriesOccurrenceDates(
      {
        frequency,
        intervalCount,
        ...(frequency === "weekly" ? { weekdays } : {}),
        startDate: date,
        ...(selectedEnd === undefined ? {} : { endDate: selectedEnd }),
      },
      date,
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
    <form
      ref={formRef}
      className={styles.seriesForm}
      action={repeat ? seriesAction : planAction}
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
          Started from {startFrom.name}. Change anything that was different; the
          saved session keeps its own.
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
                note: startFrom.note ?? "",
              }
            : refusedDraft
        }
        activities={startFrom?.activities}
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
          startDate={date}
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
            {reviewedPreview.dates.map((occurrence) => (
              <li key={occurrence}>{stampDate(occurrence)}</li>
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
            <button className={styles.primary} type="submit" disabled={pending}>
              Create recurring sessions
            </button>
          </div>
        </section>
      )}
    </form>
  );
}

export function SkippedDates({ skipped }: { skipped: SeriesSkippedDate[] }) {
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
            {stampDate(item.occurrenceDate)} —{" "}
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
