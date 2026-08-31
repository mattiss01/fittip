import Link from "next/link";

import { formatMonth, shiftMonth } from "./month";
import styles from "./progress.module.css";
import {
  longDay,
  RecordedFacts,
  type ProgressCompletionView,
} from "./progress-record";

import { COMPLETION_OUTCOME_LABELS } from "../log/log-action-state";

type Props = {
  /** The owner-local calendar month this view is showing, as `YYYY-MM`. */
  month: string;
  /** The owner-local current month, which is what the fallback means. */
  currentMonth: string;
  /**
   * The owner-local month the account was created in, or `null` when there is
   * no usable creation date and no such claim can be made.
   */
  accountMonth: string | null;
  /** Every completion in the month, most recent first. */
  entries: ProgressCompletionView[];
};

const DAY_NUMBER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: "UTC",
});

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

/**
 * One calendar month of the owner's training record, written down the page in
 * the order it happened. It counts nothing, scores nothing and compares
 * nothing: the entries are the whole answer.
 */
export function ProgressMonth({
  month,
  currentMonth,
  accountMonth,
  entries,
}: Props) {
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const days = groupByDay(entries);

  return (
    <section
      className={styles.month}
      data-progress-month={month}
      aria-labelledby="progress-month-heading"
    >
      <nav className={styles.monthNav} aria-label="Month">
        <Link
          className={styles.step}
          href={monthHref(previousMonth)}
          rel="prev"
        >
          <span className={styles.stepMark} aria-hidden="true">
            &larr;
          </span>
          <span className={styles.stepLabel}>Previous month</span>
          <span className={styles.stepMonth}>{formatMonth(previousMonth)}</span>
        </Link>
        <Link className={styles.step} href={monthHref(nextMonth)} rel="next">
          <span className={styles.stepMark} aria-hidden="true">
            &rarr;
          </span>
          <span className={styles.stepLabel}>Next month</span>
          <span className={styles.stepMonth}>{formatMonth(nextMonth)}</span>
        </Link>
      </nav>

      <header className={styles.monthHead}>
        <p className={styles.monthMark}>
          {month === currentMonth
            ? "This month"
            : month < currentMonth
              ? "Earlier"
              : "Ahead"}
        </p>
        <h2 id="progress-month-heading">{formatMonth(month)}</h2>
        {month === currentMonth ? null : (
          <Link className={styles.returnLink} href="/home/progress">
            Back to this month
          </Link>
        )}
      </header>

      {days.length > 0 ? (
        <ol className={styles.days}>
          {days.map((day) => (
            <li className={styles.day} key={day.date}>
              <p className={styles.dayMark}>
                <span className={styles.dayNumber}>{dayNumber(day.date)}</span>
                <span className={styles.dayWeekday}>{weekday(day.date)}</span>
              </p>
              <h3 className={styles.visuallyHidden}>{longDay(day.date)}</h3>
              <ol className={styles.entries}>
                {day.entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyMonth
          month={month}
          currentMonth={currentMonth}
          accountMonth={accountMonth}
        />
      )}
    </section>
  );
}

function Entry({ entry }: { entry: ProgressCompletionView }) {
  return (
    <li className={styles.entry} data-progress-entry={entry.id}>
      <div className={styles.entryHeader}>
        <h4>
          <Link
            className={styles.entryLink}
            href={`/home/progress/${entry.id}`}
          >
            {entry.title ?? "Unplanned training"}
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </h4>
        <span className={styles.stamp} data-outcome={entry.outcome}>
          {COMPLETION_OUTCOME_LABELS[entry.outcome]}
        </span>
      </div>
      {entry.sport === null && entry.plannedLocalDate === null ? null : (
        <div className={styles.marks}>
          {entry.sport === null ? null : <span>{entry.sport}</span>}
          {entry.plannedLocalDate === null ? null : (
            <span>Planned for {longDay(entry.plannedLocalDate)}</span>
          )}
        </div>
      )}
      <RecordedFacts completion={entry} />
    </li>
  );
}

/**
 * Three empty months are three different facts, and none of them is a zero.
 *
 * An owner whose account was created in the month they are looking at has no
 * earlier month in which they could have had one, so that month is the start
 * of the record rather than a gap in it. Any other empty month is a month in
 * which nothing was logged, which is a statement about that month alone. A
 * read that failed is neither, and is answered by `error.tsx` instead.
 */
function EmptyMonth({
  month,
  currentMonth,
  accountMonth,
}: {
  month: string;
  currentMonth: string;
  accountMonth: string | null;
}) {
  if (
    accountMonth !== null &&
    month === currentMonth &&
    currentMonth <= accountMonth
  ) {
    return (
      <div className={styles.empty} data-progress-empty="never">
        <h3 className={styles.emptyHeading}>Your record starts here.</h3>
        <p>
          You created your FitTip account this month, and nothing is logged in
          it yet. Log training on Today and it appears here, in the month you
          logged it for.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.empty} data-progress-empty="month">
      <h3 className={styles.emptyHeading}>
        {month < currentMonth
          ? `Nothing was logged in ${formatMonth(month)}.`
          : `Nothing is logged in ${formatMonth(month)} yet.`}
      </h3>
      <p>
        Previous month steps further back. Anything you log on Today appears
        here, in the month you logged it for.
      </p>
    </div>
  );
}

type Day = { date: string; entries: ProgressCompletionView[] };

/**
 * The entries arrive most recent first and stay in that order; this only puts
 * the ones sharing a date under one day mark.
 */
function groupByDay(entries: ProgressCompletionView[]): Day[] {
  const days: Day[] = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last?.date === entry.actualLocalDate) {
      last.entries.push(entry);
    } else {
      days.push({ date: entry.actualLocalDate, entries: [entry] });
    }
  }
  return days;
}

function monthHref(month: string) {
  return `/home/progress?month=${month}`;
}

function dayNumber(date: string) {
  return DAY_NUMBER.format(new Date(`${date}T00:00:00.000Z`));
}

function weekday(date: string) {
  return WEEKDAY.format(new Date(`${date}T00:00:00.000Z`));
}
