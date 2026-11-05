"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { skipUnloggedSessionAction } from "./unlogged-actions";
import styles from "./unlogged-reminder.module.css";
import {
  INITIAL_SKIP_STATE,
  type SkipSessionState,
  type UnloggedSessionView,
} from "./unlogged-state";

import { dayLabel } from "../log/day-label";
import { recordHref } from "../progress/record-href";

/**
 * Planned sessions from past days with no log yet (owner, 5 Nov 2026), at
 * the top of Today. Each is logged through the log form, or answered with
 * "Didn't do it", which saves a Skipped log in one tap. Nothing here is
 * written without that tap, and a session with no log is only that: not
 * missed, not failed.
 *
 * A row answered here stays, as its receipt, until the owner leaves the
 * page: the action refreshes Today, and the server's list no longer holds
 * it. Only this component knows it was just answered.
 */
export function UnloggedReminder({
  sessions,
}: {
  sessions: UnloggedSessionView[];
}) {
  const [answered, setAnswered] = useState<UnloggedSessionView[]>([]);
  const listed = new Set(sessions.map((session) => session.id));
  const rows = [
    ...sessions,
    ...answered.filter((session) => !listed.has(session.id)),
  ].toSorted(
    (left, right) =>
      left.localDate.localeCompare(right.localDate) ||
      (left.startTime ?? "~").localeCompare(right.startTime ?? "~"),
  );
  if (rows.length === 0) return null;
  const open = sessions.length;

  return (
    <section
      className={styles.reminder}
      aria-labelledby="unlogged-heading"
      data-unlogged-reminder
    >
      <header className={styles.head}>
        <h2 id="unlogged-heading">Not logged yet</h2>
        <p>
          {open === 0
            ? "Every past session here has a log now."
            : open === 1
              ? "1 planned session from a past day has no log."
              : `${open} planned sessions from past days have no log.`}
        </p>
      </header>
      <ul className={styles.rows}>
        {rows.map((session) => (
          <UnloggedRow
            key={session.id}
            session={session}
            onAnswered={() =>
              setAnswered((previous) =>
                previous.some((row) => row.id === session.id)
                  ? previous
                  : [...previous, session],
              )
            }
          />
        ))}
      </ul>
    </section>
  );
}

function UnloggedRow({
  session,
  onAnswered,
}: {
  session: UnloggedSessionView;
  onAnswered: () => void;
}) {
  const [state, skip, pending] = useActionState(
    async (previous: SkipSessionState, formData: FormData) => {
      const next = await skipUnloggedSessionAction(previous, formData);
      if (next.status === "saved") onAnswered();
      return next;
    },
    INITIAL_SKIP_STATE,
  );
  const skipped = state.status === "saved";
  const detail = [
    session.sport,
    session.startTime,
    session.expectedDurationMinutes === null
      ? null
      : `${session.expectedDurationMinutes} min planned`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={styles.row}
      data-unlogged-session={session.id}
      data-skipped={skipped || undefined}
    >
      <div className={styles.what}>
        <span className={styles.when}>{dayLabel(session.localDate)}</span>
        <h3>{session.title}</h3>
        {detail === "" ? null : <p className={styles.detail}>{detail}</p>}
      </div>
      {skipped && state.completionId ? (
        <p className={styles.receipt} role="status">
          <span className={styles.stamp}>Skipped</span>
          <Link
            className={styles.textAction}
            href={recordHref(state.completionId)}
          >
            Open log
          </Link>
        </p>
      ) : (
        <div className={styles.actions}>
          <Link
            className={styles.logAction}
            href={`/home/log?plannedSession=${session.id}&date=${session.localDate}`}
          >
            Log it
          </Link>
          <form action={skip}>
            <input type="hidden" name="plannedSessionId" value={session.id} />
            <input type="hidden" name="plannedDate" value={session.localDate} />
            <button
              type="submit"
              className={styles.skipAction}
              disabled={pending}
              aria-describedby={`unlogged-skip-${session.id}`}
            >
              {pending ? "Saving…" : "Didn't do it"}
            </button>
          </form>
          <span className="sr-only" id={`unlogged-skip-${session.id}`}>
            Saves a Skipped log for this session
          </span>
        </div>
      )}
      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
