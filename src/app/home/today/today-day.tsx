import Link from "next/link";

import styles from "./today.module.css";

import {
  COMPLETION_FEELING_LABELS,
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SIGNAL_STAMPS,
  type CompletionFeelingValue,
  type CompletionOutcome,
} from "../log/log-action-state";
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
  activityCount: number;
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
      <nav className={styles.dayNav} aria-label="Day">
        <Link className={styles.step} href={dayHref(previousDate)} rel="prev">
          <span className={styles.stepMark} aria-hidden="true">
            &larr;
          </span>
          <span className={styles.stepLabel}>Previous day</span>
          <span className={styles.stepDate}>{shortDay(previousDate)}</span>
        </Link>
        <Link className={styles.step} href={dayHref(nextDate)} rel="next">
          <span className={styles.stepMark} aria-hidden="true">
            &rarr;
          </span>
          <span className={styles.stepLabel}>Next day</span>
          <span className={styles.stepDate}>{shortDay(nextDate)}</span>
        </Link>
      </nav>

      <header className={styles.slip}>
        <p className={styles.slipMark}>
          {date === today ? "Today" : past ? "Earlier" : "Ahead"}
        </p>
        <h2 id="today-day-heading">{longDay(date)}</h2>
        {isRecoveryDay ? (
          <p className={styles.recoveryStamp}>Recovery day</p>
        ) : null}
        {date === today ? null : (
          <Link className={styles.returnLink} href="/home/today">
            Back to today
          </Link>
        )}
      </header>

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
          {longDay(lastPlannedDate)}. This day is past that, so it is unfilled
          rather than empty. Open it again once it is inside the window.
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
                className={styles.session}
                data-today-completion={completion.id}
              >
                <div className={styles.sessionHeader}>
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
                <CompletionFacts completion={completion} />
                <Link
                  className={styles.action}
                  href={`/home/log?completion=${completion.id}`}
                >
                  Edit log
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.dayActions}>
        <Link className={styles.primaryAction} href={`/home/log?date=${date}`}>
          Log unplanned training
        </Link>
        <Link className={styles.action} href="/home/plan">
          Open Plan
        </Link>
      </div>
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
  const meta = [
    session.sport,
    session.expectedDurationMinutes === null
      ? null
      : `${session.expectedDurationMinutes} min planned`,
    session.activityCount > 0
      ? `${session.activityCount} ${session.activityCount === 1 ? "activity" : "activities"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={styles.session}
      data-today-session={session.id}
      data-cancelled={session.status === "cancelled"}
      data-locked={session.isLocked}
    >
      <div className={styles.sessionHeader}>
        <h4>{session.title}</h4>
        {session.completion === null ? null : (
          <span
            className={styles.stamp}
            data-outcome={session.completion.outcome}
          >
            {COMPLETION_OUTCOME_LABELS[session.completion.outcome]}
          </span>
        )}
      </div>
      <div className={styles.marks}>
        {session.isRecurring ? <span>Recurring</span> : null}
        {session.isLocked ? <span>Locked</span> : null}
        {session.status === "cancelled" ? (
          <span>Cancelled, kept on the record</span>
        ) : null}
      </div>
      <p className={styles.meta}>{meta}</p>
      {session.intent === null ? null : (
        <p className={styles.body}>{session.intent}</p>
      )}
      {session.note === null ? null : (
        <p className={styles.body}>{session.note}</p>
      )}
      {session.completion === null ? (
        <Link
          className={styles.primaryAction}
          href={`/home/log?plannedSession=${session.id}&date=${date}`}
        >
          Log this session
        </Link>
      ) : (
        <>
          <CompletionFacts completion={session.completion} />
          <Link
            className={styles.action}
            href={`/home/log?completion=${session.completion.id}`}
          >
            Edit log
          </Link>
        </>
      )}
    </li>
  );
}

function CompletionFacts({ completion }: { completion: TodayCompletionView }) {
  const signals = COMPLETION_SIGNAL_STAMPS.filter(
    ({ key }) => completion[key],
  ).map(({ label }) => label);

  return (
    <div className={styles.record}>
      <dl className={styles.facts}>
        <div>
          <dt>Logged for</dt>
          <dd>{longDay(completion.actualLocalDate)}</dd>
        </div>
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
      {completion.replacementDescription === null ? null : (
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

function dayHref(date: string) {
  return `/home/today?date=${date}`;
}

function longDay(date: string) {
  return LONG_DAY.format(new Date(`${date}T00:00:00.000Z`));
}

function shortDay(date: string) {
  return SHORT_DAY.format(new Date(`${date}T00:00:00.000Z`));
}
