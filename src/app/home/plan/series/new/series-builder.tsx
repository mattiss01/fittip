"use client";

import { useActionState, useRef, useState } from "react";

import { RecurrenceFields } from "../../recurrence-fields";
import {
  INITIAL_SERIES_ACTION_STATE,
  type SeriesSkippedDate,
} from "../../series-action-state";
import { changeSeriesAction } from "../../series-actions";
import { seriesOccurrenceDates } from "../../series-recurrence";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "../../series-transition-watch";
import styles from "../../plan.module.css";

import { shiftIsoDate } from "@/lib/date/local-date";

export type SeriesSourceView = {
  kind: "plan" | "saved";
  id: string;
  label: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  activityCount: number;
  suggestedStartDate: string;
};

type Preview = {
  dates: string[];
  openEnded: boolean;
};

const RECOVERY_FLAG = "fittip.plan.series-create.recovered:v1";

export function SeriesBuilder({
  source,
  today,
  lastDate,
  expectedRevision,
}: {
  source: SeriesSourceView;
  today: string;
  lastDate: string;
  expectedRevision: number;
}) {
  const [state, action, pending] = useActionState(
    changeSeriesAction,
    INITIAL_SERIES_ACTION_STATE,
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const startDate =
    source.suggestedStartDate >= today && source.suggestedStartDate <= lastDate
      ? source.suggestedStartDate
      : today;
  const [selectedStartDate, setSelectedStartDate] = useState(startDate);
  const stall = useSeriesMutationStall(
    pending,
    state.submission,
    RECOVERY_FLAG,
  );
  const recovered = useSeriesRecoveredReload(state.submission, RECOVERY_FLAG);
  const notice =
    seriesStallNotice(stall) ??
    (pending ? "Creating recurring series…" : null) ??
    (recovered
      ? "The page was reloaded after the create response was lost. Return to the Plan to confirm what is saved."
      : state.message);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);

  function invalidatePreview() {
    setPreview(null);
    setPreviewError(null);
  }

  function review() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const values = new FormData(form);
    const frequency = values.get("frequency");
    const selectedStart = values.get("startDate");
    const intervalCount = Number(values.get("intervalCount"));
    const noEnd = values.get("noEnd") === "true";
    const selectedEnd = noEnd ? undefined : values.get("endDate");
    const weekdays = values
      .getAll("weekdays")
      .map(Number)
      .filter(Number.isInteger);
    if (
      (frequency !== "daily" && frequency !== "weekly") ||
      typeof selectedStart !== "string" ||
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
    const searchEnd = selectedEnd ?? shiftIsoDate(selectedStart, 3700);
    const dates = seriesOccurrenceDates(
      {
        frequency,
        intervalCount,
        ...(frequency === "weekly" ? { weekdays } : {}),
        startDate: selectedStart,
        ...(selectedEnd === undefined ? {} : { endDate: selectedEnd }),
      },
      selectedStart,
      searchEnd,
      5,
    );
    if (dates.length === 0) {
      setPreviewError(
        "This rule has no occurrence in its date range. Change the dates or weekdays.",
      );
      return;
    }
    setPreviewError(null);
    setPreview({ dates, openEnded: noEnd });
  }

  return (
    <div className={styles.seriesBuilder}>
      <section className={styles.sourceCard} aria-labelledby="series-source">
        <p className={styles.sectionLabel}>Repeat from {source.label}</p>
        <h2 id="series-source">{source.title}</h2>
        <p className={styles.meta}>
          {[
            source.sport,
            source.expectedDurationMinutes === null
              ? null
              : source.expectedDurationMinutes + " min",
            source.activityCount === 0
              ? null
              : source.activityCount +
                " " +
                (source.activityCount === 1 ? "activity" : "activities"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>

      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
      {state.conflict === "stale" ||
      state.conflict === "timezone" ||
      state.status === "session" ||
      stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/plan">
          Restart from the current Plan
        </a>
      ) : null}

      <form ref={formRef} className={styles.seriesForm} action={action}>
        <input type="hidden" name="operation" value="add_series" />
        <input type="hidden" name="sourceKind" value={source.kind} />
        <input type="hidden" name="sourceId" value={source.id} />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <div className={styles.field}>
          <label htmlFor="series-start">Start date</label>
          <input
            id="series-start"
            name="startDate"
            type="date"
            min={today}
            max={lastDate}
            required
            value={selectedStartDate}
            onChange={(event) => {
              setSelectedStartDate(event.target.value);
              invalidatePreview();
            }}
          />
        </div>
        <RecurrenceFields
          idPrefix="create-series"
          startDate={selectedStartDate}
          onRuleChange={invalidatePreview}
        />

        {previewError === null ? null : (
          <p className={styles.inlineError} role="alert">
            {previewError}
          </p>
        )}

        {preview === null ? (
          <button
            className={styles.primary}
            type="button"
            onClick={review}
            disabled={pending || state.status === "saved"}
          >
            Review recurring sessions
          </button>
        ) : (
          <section className={styles.reviewCard} aria-labelledby="review-title">
            <p className={styles.sectionLabel}>Review before saving</p>
            <h2 id="review-title">First occurrences</h2>
            <ol className={styles.previewDates}>
              {preview.dates.map((date) => (
                <li key={date}>{stampDate(date)}</li>
              ))}
            </ol>
            <p className={styles.consequenceStandalone}>
              {preview.openEnded
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
                Change rule
              </button>
              <button
                className={styles.primary}
                type="submit"
                disabled={pending || state.status === "saved"}
              >
                Create recurring series
              </button>
            </div>
          </section>
        )}
      </form>

      <SkippedDates skipped={state.skipped ?? []} />
      {state.status === "saved" ? (
        <a className={styles.reload} href="/home/plan">
          View the current Plan
        </a>
      ) : null}
    </div>
  );
}

function SkippedDates({ skipped }: { skipped: SeriesSkippedDate[] }) {
  if (skipped.length === 0) return null;
  return (
    <section className={styles.skippedCard} aria-labelledby="skipped-title">
      <h2 id="skipped-title">Dates not added</h2>
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
