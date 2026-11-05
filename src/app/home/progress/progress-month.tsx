import Link from "next/link";
import type { CSSProperties } from "react";

import { formatMonth, monthWindow, shiftMonth } from "./month";
import styles from "./progress.module.css";
import { longDay, type ProgressCompletionView } from "./progress-record";
import {
  countOutcomes,
  countRecord,
  formatMinutes,
  groupByWeek,
  sessionCount,
  sessionsBySport,
  type RecordCount,
} from "./record-counts";
import { colourOf, type SportColour } from "./sport-colours";

import {
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SIGNAL_STAMPS,
} from "../log/log-action-state";
import { mondayOf } from "../plan/plan-weeks";
import { OutcomeMark } from "@/components/training/outcome-mark";
import { shiftIsoDate } from "@/lib/date/local-date";

type Props = {
  /** The owner-local calendar month this view is showing, as `YYYY-MM`. */
  month: string;
  /** The owner-local current month, which is what the fallback means. */
  currentMonth: string;
  /** The owner-local date, which names this week. */
  today: string;
  /**
   * The owner-local month the account was created in, or `null` when there is
   * no usable creation date and no such claim can be made.
   */
  accountMonth: string | null;
  /** The owner's sports, most-logged first, each with its colour. */
  sports: SportColour[];
  /** The sport being shown, or `null` for all of them. */
  sport: string | null;
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

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** How many activities a card names before it says how many more there are. */
const ACTIVITIES_ON_A_CARD = 2;

/**
 * One calendar month of the owner's training record, split by sport (owner,
 * 5 Nov 2026, P1): a row of the owner's sports, what the month holds of the
 * one chosen, and its logs a week at a time, most recent first. It counts the
 * owner's own logs and nothing else - no target, score, streak or trend.
 */
export function ProgressMonth({
  month,
  currentMonth,
  today,
  accountMonth,
  sports,
  sport,
  entries,
}: Props) {
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const shown =
    sport === null ? entries : entries.filter((entry) => entry.sport === sport);
  const weeks = groupByWeek(shown);
  const thisWeek = mondayOf(today);
  const { startDate, endDate } = monthWindow(month);
  const style = (of: string | null) => sportStyleOf(sports, of);

  return (
    <section
      className={styles.month}
      data-progress-month={month}
      data-progress-sport={sport ?? "all"}
      aria-labelledby="progress-month-heading"
    >
      {sports.length === 0 ? null : (
        <nav className={styles.sportChips} aria-label="Sports">
          {[null, ...sports.map((entry) => entry.sport)].map((chip) => (
            <Link
              key={chip ?? "all"}
              className={styles.sportChip}
              href={progressHref(month, currentMonth, chip)}
              aria-current={chip === sport ? "page" : undefined}
              style={chip === null ? undefined : style(chip)}
            >
              {chip === null ? null : (
                <span className={styles.sportDot} aria-hidden="true" />
              )}
              {chip ?? "All"}
            </Link>
          ))}
        </nav>
      )}

      {/* The month between its two arrows, as the Plan's week and Today's
          day are (R3). The arrows say which month they open. */}
      <header className={styles.monthHead}>
        <Link
          className={styles.step}
          href={monthHref(previousMonth, sport)}
          rel="prev"
          aria-label={`Previous month, ${formatMonth(previousMonth)}`}
        >
          <ChevronIcon direction="left" />
        </Link>
        <h2 id="progress-month-heading">{formatMonth(month)}</h2>
        <Link
          className={styles.step}
          href={monthHref(nextMonth, sport)}
          rel="next"
          aria-label={`Next month, ${formatMonth(nextMonth)}`}
        >
          <ChevronIcon direction="right" />
        </Link>
      </header>
      {month === currentMonth ? null : (
        <Link
          className={styles.returnLink}
          href={progressHref(currentMonth, currentMonth, sport)}
        >
          Back to this month
        </Link>
      )}

      {shown.length > 0 ? (
        <>
          <MonthSummary
            month={month}
            currentMonth={currentMonth}
            sports={sports}
            sport={sport}
            entries={shown}
          />
          <ol className={styles.weeks}>
            {weeks.map((week) => {
              // A week is counted only as far as it lies in this month, so
              // its heading names those days and no others.
              const first = week.monday < startDate ? startDate : week.monday;
              const sunday = shiftIsoDate(week.monday, 6);
              const last = sunday > endDate ? endDate : sunday;
              const whole = first === week.monday && last === sunday;
              return (
                <li key={week.monday} className={styles.week}>
                  <div className={styles.weekHead}>
                    <h3>
                      {whole && week.monday === thisWeek
                        ? "This week"
                        : first === last
                          ? dayMonth(first)
                          : `${dayMonth(first)} – ${dayMonth(last)}`}
                    </h3>
                    <p>{weekCountText(countRecord(week.entries))}</p>
                  </div>
                  <ol className={styles.entries}>
                    {week.entries.map((entry) => (
                      <Entry
                        key={entry.id}
                        entry={entry}
                        style={style(entry.sport)}
                      />
                    ))}
                  </ol>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <EmptyMonth
          month={month}
          currentMonth={currentMonth}
          accountMonth={accountMonth}
          sport={sport}
        />
      )}
    </section>
  );
}

/**
 * What the month holds of the sport shown: the sessions that record training
 * and their time, then each outcome by count. On all sports, a bar of the
 * month's sessions by sport, and under it each sport as a link that opens it:
 * the bar's parts are a picture, too thin to tap, so the legend is the target.
 */
function MonthSummary({
  month,
  currentMonth,
  sports,
  sport,
  entries,
}: {
  month: string;
  currentMonth: string;
  sports: SportColour[];
  sport: string | null;
  entries: ProgressCompletionView[];
}) {
  const count = countRecord(entries);
  const style = (of: string | null) => sportStyleOf(sports, of);
  const bySport =
    sport === null
      ? sessionsBySport(
          entries,
          sports.map((entry) => entry.sport),
        )
      : [];

  return (
    <section
      className={styles.summary}
      data-progress-summary
      aria-label={`${sport ?? "All sports"} in ${formatMonth(month)}`}
      style={sport === null ? undefined : style(sport)}
      data-sport={sport === null ? undefined : true}
    >
      <p className={styles.summaryLine}>
        <strong>{sessionCount(count.sessions)}</strong>
        {count.minutes > 0 ? (
          <span> · {formatMinutes(count.minutes)}</span>
        ) : null}
      </p>
      {count.withoutDuration === 0 ? null : (
        <p className={styles.summaryNote}>
          {count.withoutDuration === 1
            ? "1 session has no duration and is not in the time."
            : `${count.withoutDuration} sessions have no duration and are not in the time.`}
        </p>
      )}
      {bySport.length === 0 ? null : (
        <>
          <div className={styles.sportBar} aria-hidden="true">
            {bySport.map((part) => (
              <span
                key={part.sport}
                className={styles.sportBarPart}
                style={{ ...style(part.sport), flexGrow: part.sessions }}
              />
            ))}
          </div>
          <ul className={styles.sportLegend}>
            {bySport.map((part) => (
              <li key={part.sport}>
                <Link
                  href={progressHref(month, currentMonth, part.sport)}
                  style={style(part.sport)}
                  aria-label={`${part.sport}: ${sessionCount(part.sessions)}`}
                >
                  <span className={styles.sportDot} aria-hidden="true" />
                  {part.sport} {part.sessions}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className={styles.outcomeCounts}>
        {countOutcomes(entries).map(({ outcome, count: outcomes }) => (
          <li key={outcome}>
            <OutcomeMark outcome={outcome} />
            {outcomes} {COMPLETION_OUTCOME_LABELS[outcome].toLowerCase()}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Entry({
  entry,
  style,
}: {
  entry: ProgressCompletionView;
  /** Carries the sport's colour as `--sport`. */
  style: CSSProperties;
}) {
  const signals = COMPLETION_SIGNAL_STAMPS.filter(({ key }) => entry[key]).map(
    ({ label }) => label,
  );
  const activities = entry.activities ?? [];
  const named = activities.slice(0, ACTIVITIES_ON_A_CARD);
  const more = activities.length - named.length;
  const facts = [
    entry.sport,
    entry.startTime,
    entry.durationMinutes === null ? null : `${entry.durationMinutes} min`,
    entry.perceivedEffort === null
      ? null
      : `Effort ${entry.perceivedEffort} of 10`,
  ].filter((fact): fact is string => fact !== null);
  // A planned log is shown on the day it was done; only one done on another
  // day than planned says when that was.
  const plannedElsewhere =
    entry.plannedLocalDate !== null &&
    entry.plannedLocalDate !== entry.actualLocalDate;

  return (
    <li
      className={styles.entry}
      data-progress-entry={entry.id}
      data-outcome={entry.outcome}
      style={style}
    >
      <p className={styles.entryDay}>
        <span className={styles.entryDayNumber}>
          {dayNumber(entry.actualLocalDate)}
        </span>
        <span className={styles.entryWeekday}>
          {weekday(entry.actualLocalDate)}
        </span>
        <span className={styles.visuallyHidden}>
          {longDay(entry.actualLocalDate)}
        </span>
      </p>
      <div className={styles.entryBody}>
        <div className={styles.entryHeader}>
          {/* The title opens the record; its hit area covers the card, under
              the card's own links. */}
          <h4>
            <Link
              className={styles.entryLink}
              href={`/home/progress/${entry.id}`}
            >
              {entry.title ?? "Unplanned training"}
            </Link>
          </h4>
          <span className={styles.stamp} data-outcome={entry.outcome}>
            {COMPLETION_OUTCOME_LABELS[entry.outcome]}
          </span>
        </div>
        {facts.length === 0 ? null : (
          <p className={styles.entryFacts}>
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        )}
        {plannedElsewhere && entry.plannedLocalDate !== null ? (
          <p className={styles.entryAside}>
            Planned for {longDay(entry.plannedLocalDate)}
          </p>
        ) : null}
        {named.length === 0 ? null : (
          <ul className={styles.entryActivities}>
            {named.map((activity) => (
              <li key={activity.position}>
                <span>{activity.name}</span>
                {activity.detail === null ? null : (
                  <span className={styles.entryActivityDetail}>
                    {activity.detail}
                  </span>
                )}
              </li>
            ))}
            {more <= 0 ? null : (
              <li className={styles.entryAside}>
                and {more} more {more === 1 ? "activity" : "activities"}
              </li>
            )}
          </ul>
        )}
        {entry.replaces.length === 0 ? null : (
          <p className={styles.entryAside} data-replaces>
            Instead of:{" "}
            {entry.replaces.map((replaced, index) => (
              <span key={replaced.id}>
                {index === 0 ? null : ", "}
                <Link href={`/home/progress/${replaced.id}`}>
                  {replaced.label}
                </Link>
              </span>
            ))}
          </p>
        )}
        {entry.replacedBy !== null ? (
          <p className={styles.entryAside} data-replaced-by>
            Instead:{" "}
            <Link href={`/home/progress/${entry.replacedBy.id}`}>
              {entry.replacedBy.label}
            </Link>
          </p>
        ) : entry.replacementDescription === null ? null : (
          <p className={styles.entryAside}>
            Instead: {entry.replacementDescription}
          </p>
        )}
        {entry.note === null ? null : (
          <p className={styles.entryNote}>{entry.note}</p>
        )}
        {signals.length === 0 ? null : (
          <p className={styles.signals} data-progress-signals>
            You reported: {signals.join(", ")}.
          </p>
        )}
      </div>
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
 * read that failed is neither, and is answered by `error.tsx` instead. A
 * sport shown alone says it is that sport the month has none of.
 */
function EmptyMonth({
  month,
  currentMonth,
  accountMonth,
  sport,
}: {
  month: string;
  currentMonth: string;
  accountMonth: string | null;
  sport: string | null;
}) {
  if (
    sport === null &&
    accountMonth !== null &&
    month === currentMonth &&
    currentMonth <= accountMonth
  ) {
    return (
      <div className={styles.empty} data-progress-empty="never">
        <h3 className={styles.emptyHeading}>Your record starts here</h3>
        <p>
          Log training on Today and it appears in the month you logged it for.
        </p>
      </div>
    );
  }

  const what = sport === null ? "Nothing" : `No ${sport}`;
  return (
    <div className={styles.empty} data-progress-empty="month">
      <h3 className={styles.emptyHeading}>
        {month < currentMonth
          ? `${what} was logged in ${formatMonth(month)}.`
          : `${what} is logged in ${formatMonth(month)} yet.`}
      </h3>
      <p>Anything you log appears in the month you logged it for.</p>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/**
 * The month and the sport in the URL. The current month is left out, as it
 * always was, so "Back to this month" and the chips of this month read
 * `/home/progress`.
 */
function progressHref(
  month: string,
  currentMonth: string,
  sport: string | null,
) {
  return month === currentMonth
    ? withSport({}, sport)
    : monthHref(month, sport);
}

/** The arrows always name the month they open. */
function monthHref(month: string, sport: string | null) {
  return withSport({ month }, sport);
}

function withSport(query: Record<string, string>, sport: string | null) {
  const search = new URLSearchParams(
    sport === null ? query : { ...query, sport },
  ).toString();
  return search === "" ? "/home/progress" : `/home/progress?${search}`;
}

/** A week's line: its sessions, their time, and any it could not time. */
function weekCountText(count: RecordCount) {
  return [
    sessionCount(count.sessions),
    count.minutes > 0 ? formatMinutes(count.minutes) : null,
    count.withoutDuration > 0
      ? `${count.withoutDuration} without a duration`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** A sport's colour, as the `--sport` its card, chip and legend draw with. */
function sportStyleOf(sports: SportColour[], sport: string | null) {
  return { "--sport": colourOf(sports, sport) } as CSSProperties;
}

function dayNumber(date: string) {
  return DAY_NUMBER.format(new Date(`${date}T00:00:00.000Z`));
}

function weekday(date: string) {
  return WEEKDAY.format(new Date(`${date}T00:00:00.000Z`));
}

function dayMonth(date: string) {
  return DAY_MONTH.format(new Date(`${date}T00:00:00.000Z`));
}
