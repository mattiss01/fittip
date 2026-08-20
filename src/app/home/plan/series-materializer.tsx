"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

import {
  INITIAL_MATERIALIZE_ACTION_STATE,
  type SeriesSkippedDate,
} from "./series-action-state";
import { materializePlanSeriesAction } from "./series-actions";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "./series-transition-watch";
import styles from "./plan.module.css";

const RECOVERY_FLAG = "fittip.plan.series-materialize.recovered:v1";

export function SeriesMaterializer({
  expectedRevision,
  uncoveredDates,
}: {
  expectedRevision: number;
  uncoveredDates: string[];
}) {
  const [state, action, pending] = useActionState(
    materializePlanSeriesAction,
    INITIAL_MATERIALIZE_ACTION_STATE,
  );
  const attempted = useRef(false);
  const stall = useSeriesMutationStall(
    pending,
    state.submission,
    RECOVERY_FLAG,
  );
  const recovered = useSeriesRecoveredReload(state.submission, RECOVERY_FLAG);
  const recoveredIdle = recovered && state.status === "idle";

  useEffect(() => {
    if (uncoveredDates.length === 0 || attempted.current) return;
    attempted.current = true;
    const formData = new FormData();
    formData.set("expectedRevision", String(expectedRevision));
    startTransition(() => action(formData));
  }, [action, expectedRevision, uncoveredDates]);

  if (
    uncoveredDates.length === 0 &&
    state.status === "idle" &&
    !pending &&
    !recoveredIdle
  ) {
    return null;
  }

  const extending = pending || (state.status === "idle" && !recoveredIdle);
  const notice =
    seriesStallNotice(stall) ??
    (extending
      ? "Extending your recurring sessions…"
      : recoveredIdle
        ? "The Plan was reloaded after the extension response was lost. What you see is what is saved."
        : state.message);
  const noticeState = stall ?? (recoveredIdle ? "recovered" : state.status);

  return (
    <section
      className={styles.extensionCard}
      data-state={noticeState}
      aria-labelledby="series-extension-title"
    >
      <p className={styles.sectionLabel}>Fourteen-day window</p>
      <h2 id="series-extension-title">{notice}</h2>
      {extending && uncoveredDates.length > 0 ? (
        <p>
          Checking {dateList(uncoveredDates)}. The Plan remains usable while
          these owner-local dates are filled.
        </p>
      ) : null}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {notice}
      </p>
      <SkippedDates skipped={state.skipped ?? []} />
      {state.status === "conflict" ||
      state.status === "session" ||
      state.status === "error" ||
      stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/plan">
          Reload the Plan to continue
        </a>
      ) : null}
    </section>
  );
}

function SkippedDates({ skipped }: { skipped: SeriesSkippedDate[] }) {
  if (skipped.length === 0) return null;
  return (
    <ul className={styles.extensionSkipped}>
      {skipped.map((item) => (
        <li key={item.occurrenceDate + "-" + item.reason}>
          {stampDate(item.occurrenceDate)}:{" "}
          {item.reason === "daily-session-limit"
            ? "not added because this date already has ten sessions"
            : "not added in this pass; reload the Plan to continue"}
        </li>
      ))}
    </ul>
  );
}

function dateList(dates: string[]) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return new Intl.ListFormat("en-GB", {
    style: "long",
    type: "conjunction",
  }).format(
    dates.map((date) => formatter.format(new Date(date + "T12:00:00.000Z"))),
  );
}

function stampDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate + "T12:00:00.000Z"));
}
