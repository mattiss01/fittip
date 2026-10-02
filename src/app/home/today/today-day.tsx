import Link from "next/link";

import styles from "./today.module.css";

import {
  COMPLETION_FEELING_LABELS,
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SIGNAL_STAMPS,
  type CompletionFeelingValue,
  type CompletionOutcome,
  recordsTraining,
} from "../log/log-action-state";
import { SaveToLibrary } from "../plan/saved/save-to-library";
import { sessionHref } from "../plan/session-view";
import {
  ActivityList,
  type ActivityListItem,
} from "@/components/training/activity-list";
import { OutcomeMark } from "@/components/training/outcome-mark";
import { shiftIsoDate } from "@/lib/date/local-date";

/** What the owner recorded, reduced to what this day actually draws. */
export type TodayCompletionView = {
  id: string;
  outcome: CompletionOutcome;
  actualLocalDate: string;
  /** The planned session's title as it stood when the log was written. */
  title: string | null;
  /** The sport, from that snapshot or from the owner's own unplanned entry. */
  sport: string | null;
  /** The date that planned session sat on, which a late log will not match. */
  plannedLocalDate: string | null;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: CompletionFeelingValue | null;
  note: string | null;
  replacementDescription: string | null;
  /**
   * The unplanned log a replaced one points at, already in words. Null on
   * every other outcome and on a replaced log written before the link, which
   * shows its text instead.
   */
  replacedBy: { id: string; label: string } | null;
  /** The planned sessions this unplanned training stood in for, by name. */
  replaces: { id: string; label: string }[];
  /** What was actually done, in the order it was done. */
  activities: ActivityListItem[];
  pain: boolean;
  illness: boolean;
  injury: boolean;
  severeFatigue: boolean;
};

export type TodaySessionView = {
  id: string;
  position: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  isLocked: boolean;
  status: "active" | "cancelled";
  isRecurring: boolean;
  /** In plan order, each with its target in words. */
  activities: ActivityListItem[];
  /** The owner's record of what happened to this planned session, if any. */
  completion: TodayCompletionView | null;
};

type Props = {
  /** The owner-local date this view is showing. */
  date: string;
  /** Owner-local today, which is what the fallback and the marker mean. */
  today: string;
  /** The last date recurring sessions are materialized through. */
  lastPlannedDate: string;
  isRecoveryDay: boolean;
  /** False when the ADR-017 top-up could not run for this read. */
  toppedUp: boolean;
  sessions: TodaySessionView[];
  /**
   * Completions logged on this day that no card above carries: training that
   * was never planned, and a session logged on a day other than the one it was
   * planned for. Neither has a plan card here, so neither may be dropped.
   */
  unattached: TodayCompletionView[];
};

const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const HEADING_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function TodayDay({
  date,
  today,
  lastPlannedDate,
  isRecoveryDay,
  toppedUp,
  sessions,
  unattached,
}: Props) {
  const previousDate = shiftIsoDate(date, -1);
  const nextDate = shiftIsoDate(date, 1);
  const beyondWindow = date > lastPlannedDate;
  const past = date < today;

  return (
    <section
      className={styles.day}
      data-today-date={date}
      data-recovery={isRecoveryDay}
      aria-labelledby="today-day-heading"
    >
      <nav className={styles.strip} aria-label="Week">
        {stripDates(date).map((stripDate) => (
          <Link
            key={stripDate}
            className={styles.stripDay}
            href={dayHref(stripDate)}
            aria-current={stripDate === date ? "date" : undefined}
            aria-label={shortDay(stripDate)}
            data-today={stripDate === today}
          >
            <span className={styles.stripWeekday} aria-hidden="true">
              {WEEKDAY.format(asDate(stripDate))}
            </span>
            <span className={styles.stripNumber} aria-hidden="true">
              {Number(stripDate.slice(8, 10))}
            </span>
            <span className={styles.stripDot} aria-hidden="true" />
          </Link>
        ))}
      </nav>

      <header className={styles.dayHead}>
        <Link
          className={styles.step}
          href={dayHref(previousDate)}
          rel="prev"
          aria-label={`Previous day, ${shortDay(previousDate)}`}
        >
          <ChevronIcon direction="left" />
        </Link>
        <div className={styles.dayTitle}>
          <h2 id="today-day-heading">{HEADING_DAY.format(asDate(date))}</h2>
          {isRecoveryDay ? (
            <p className={styles.recoveryStamp}>Recovery day</p>
          ) : null}
        </div>
        <Link
          className={styles.step}
          href={dayHref(nextDate)}
          rel="next"
          aria-label={`Next day, ${shortDay(nextDate)}`}
        >
          <ChevronIcon direction="right" />
        </Link>
      </header>
      {date === today ? null : (
        <Link className={styles.returnLink} href="/home/today">
          Back to today
        </Link>
      )}

      {toppedUp ? null : (
        <p className={styles.notice} data-today-notice="top-up">
          Recurring sessions could not be extended for this read, so this day
          may be missing occurrences one of your series would produce. It is not
          necessarily empty. Reload to try again.
        </p>
      )}
      {beyondWindow ? (
        <p className={styles.notice} data-today-notice="beyond-window">
          FitTip writes recurring sessions ahead only through{" "}
          {longDay(lastPlannedDate)}. This day is past that, so your repeats are
          not on it yet. A single session placed here is.
        </p>
      ) : null}

      {sessions.length > 0 ? (
        <ol className={styles.sessions}>
          {sessions.map((session) => (
            <SessionCard key={session.id} date={date} session={session} />
          ))}
        </ol>
      ) : toppedUp && !beyondWindow ? (
        // "Nothing planned" is a claim about the plan, and it is only true
        // when the window this day belongs to was actually filled. When the
        // top-up could not run, or the day is past the horizon FitTip fills
        // ahead, the notice above is the whole answer and this sentence would
        // contradict it.
        <p className={styles.empty} data-today-empty="sessions">
          {past
            ? "Nothing was planned on this day."
            : "Nothing is planned on this day."}
        </p>
      ) : null}

      {unattached.length === 0 ? null : (
        <section className={styles.unplanned} aria-labelledby="today-unplanned">
          <h3 id="today-unplanned" className={styles.sectionLabel}>
            Also logged
          </h3>
          <ol className={styles.sessions}>
            {unattached.map((completion) => (
              <li
                key={completion.id}
                className={styles.receipt}
                data-today-completion={completion.id}
              >
                <div className={styles.receiptHead}>
                  <OutcomeMark outcome={completion.outcome} />
                  <h4>{completion.title ?? "Unplanned training"}</h4>
                  <span
                    className={styles.stamp}
                    data-outcome={completion.outcome}
                  >
                    {COMPLETION_OUTCOME_LABELS[completion.outcome]}
                  </span>
                </div>
                {completion.sport === null &&
                completion.plannedLocalDate === null ? null : (
                  <div className={styles.marks}>
                    {completion.sport === null ? null : (
                      <span>{completion.sport}</span>
                    )}
                    {completion.plannedLocalDate === null ? null : (
                      <span>
                        Planned for {longDay(completion.plannedLocalDate)}
                      </span>
                    )}
                  </div>
                )}
                <CompletionFacts completion={completion} date={date} />
                <div className={styles.receiptActions}>
                  <Link
                    className={styles.textAction}
                    href={`/home/log?completion=${completion.id}`}
                  >
                    Edit log
                  </Link>
                  <SaveLoggedSession completion={completion} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link className={styles.addAction} href={`/home/log?date=${date}`}>
        <span aria-hidden="true">+</span>
        Log unplanned training
      </Link>
    </section>
  );
}

function SessionCard({
  date,
  session,
}: {
  date: string;
  session: TodaySessionView;
}) {
  const summary = [
    session.sport,
    session.expectedDurationMinutes === null
      ? null
      : `${session.expectedDurationMinutes} min planned`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Trained anyway: once a log is attached, the card reads as logged. The
  // cancellation stays in the plan row and in the log's own snapshot.
  const showsCancelled =
    session.status === "cancelled" && session.completion === null;
  const logged = session.completion !== null;

  return (
    <li
      className={logged ? styles.receipt : styles.session}
      data-today-session={session.id}
      data-cancelled={showsCancelled}
      data-locked={session.isLocked}
    >
      <div className={logged ? styles.receiptHead : styles.sessionHead}>
        {session.completion === null ? null : (
          <OutcomeMark outcome={session.completion.outcome} />
        )}
        {/* The title opens the session's own page, where every plan verb
            lives now; its hit area covers the card, under the card's own
            links, so Log and Edit log stay one tap. */}
        <h4>
          <Link
            className={styles.cardLink}
            href={sessionHref(session.id, { from: "today", date })}
          >
            {session.title}
          </Link>
        </h4>
        {session.completion === null ? null : (
          <span
            className={styles.stamp}
            data-outcome={session.completion.outcome}
          >
            {COMPLETION_OUTCOME_LABELS[session.completion.outcome]}
          </span>
        )}
      </div>
      {/* Under the title, as on the session's own page (owner, 1 Oct 2026). */}
      {logged || summary === "" ? null : (
        <p className={styles.summary}>{summary}</p>
      )}
      {session.isRecurring || session.isLocked || showsCancelled ? (
        <div className={styles.marks}>
          {session.isRecurring ? <span>Recurring</span> : null}
          {session.isLocked ? <span>Locked</span> : null}
          {showsCancelled ? <span>Cancelled, kept on the record</span> : null}
        </div>
      ) : null}
      {session.intent === null || logged ? null : (
        <p className={styles.body}>{session.intent}</p>
      )}
      {session.note === null ? null : (
        <p className={styles.body}>{session.note}</p>
      )}
      {/* The plan's list until the log has actuals of its own, which then say
          what was done and are the ones worth reading. A skipped or replaced
          log records none, and still shows what the plan asked for. */}
      {session.completion === null ||
      session.completion.activities.length === 0 ? (
        <ActivityList label="Planned" items={session.activities} />
      ) : null}
      {session.completion === null ? (
        <Link
          className={styles.logAction}
          href={`/home/log?plannedSession=${session.id}&date=${date}`}
        >
          Log this session
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <>
          <CompletionFacts completion={session.completion} date={date} />
          <div className={styles.receiptActions}>
            <Link
              className={styles.textAction}
              href={`/home/log?completion=${session.completion.id}`}
            >
              Edit log
            </Link>
            <SaveLoggedSession completion={session.completion} />
          </div>
        </>
      )}
    </li>
  );
}

function CompletionFacts({
  completion,
  date,
}: {
  completion: TodayCompletionView;
  date: string;
}) {
  const signals = COMPLETION_SIGNAL_STAMPS.filter(
    ({ key }) => completion[key],
  ).map(({ label }) => label);

  return (
    <div className={styles.record}>
      <dl className={styles.facts}>
        {/* The day it was logged for only says something when it is not the
            day on screen: a planned session done on another day. */}
        {completion.actualLocalDate === date ? null : (
          <div>
            <dt>Logged for</dt>
            <dd>{longDay(completion.actualLocalDate)}</dd>
          </div>
        )}
        {completion.durationMinutes === null ? null : (
          <div>
            <dt>Duration</dt>
            <dd>{completion.durationMinutes} min</dd>
          </div>
        )}
        {completion.perceivedEffort === null ? null : (
          <div>
            <dt>Effort</dt>
            <dd>{completion.perceivedEffort} of 10</dd>
          </div>
        )}
        {completion.feeling === null ? null : (
          <div>
            <dt>Felt</dt>
            <dd>{COMPLETION_FEELING_LABELS[completion.feeling]}</dd>
          </div>
        )}
      </dl>
      <ActivityList label="What you did" items={completion.activities} />
      {completion.replaces.length === 0 ? null : (
        <p className={styles.body} data-replaces>
          Instead of:{" "}
          {completion.replaces.map((replaced, index) => (
            <span key={replaced.id}>
              {index === 0 ? null : ", "}
              <Link href={`/home/progress/${replaced.id}`}>
                {replaced.label}
              </Link>
            </span>
          ))}
        </p>
      )}
      {completion.replacedBy !== null ? (
        <p className={styles.body} data-replaced-by>
          Instead:{" "}
          <Link href={`/home/progress/${completion.replacedBy.id}`}>
            {completion.replacedBy.label}
          </Link>
        </p>
      ) : completion.replacementDescription === null ? null : (
        <p className={styles.body}>
          Instead: {completion.replacementDescription}
        </p>
      )}
      {completion.note === null ? null : (
        <p className={styles.body}>{completion.note}</p>
      )}
      {signals.length === 0 ? null : (
        <p className={styles.signals} data-today-signals>
          You reported: {signals.join(", ")}.
        </p>
      )}
    </div>
  );
}

/** A week around the day on screen, which sits in the middle of it. */
function stripDates(date: string) {
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => shiftIsoDate(date, offset));
}

function dayHref(date: string) {
  return `/home/today?date=${date}`;
}

function asDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function longDay(date: string) {
  return LONG_DAY.format(asDate(date));
}

function shortDay(date: string) {
  return SHORT_DAY.format(asDate(date));
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
 * "Save session to library" on a logged card (owner, 27 Sep 2026), so a
 * session done the same way again can start from this one. Training that
 * happened only: a skip or a replacement records none, so it offers nothing.
 */
function SaveLoggedSession({
  completion,
}: {
  completion: TodayCompletionView;
}) {
  if (!recordsTraining(completion.outcome)) return null;
  return (
    <SaveToLibrary
      completionId={completion.id}
      defaultName={completion.title ?? ""}
    />
  );
}
