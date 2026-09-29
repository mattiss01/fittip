"use client";

import Link from "next/link";
import { useActionState, useCallback, useState, type ReactNode } from "react";

import { INITIAL_PLAN_ACTION_STATE } from "./action-state";
import { changePlanAction } from "./actions";
import { COMPLETION_OUTCOME_LABELS } from "../log/log-action-state";
import { CreateSession } from "./create-session";
import { ActivityList } from "@/components/training/activity-list";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import styles from "./plan.module.css";
import {
  RECOVERED_NOTICE,
  SERIES_RECOVERY_FLAG,
  stallNotice,
  useMutationStall,
  useRecoveredReload,
} from "./plan-mutation-watch";
import { INITIAL_SERIES_ACTION_STATE } from "./series-action-state";
import { changeSeriesAction } from "./series-actions";
import { SeriesMaterializer } from "./series-materializer";
import {
  readsAsLogged,
  sessionHref,
  stampDate,
  type PlanSessionView,
} from "./session-view";

import type { SavedSessionOption } from "@/components/training/saved-session-picker";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "./series-transition-watch";

export type { PlanSessionLog, PlanSessionView } from "./session-view";

type Props = {
  today: string;
  /** Owner-local dates this surface reads and writes, ascending. */
  dates: string[];
  expectedRevision: number;
  sessions: PlanSessionView[];
  recoveryDates: string[];
  /** What Create session may start from. */
  savedSessions?: SavedSessionOption[];
  uncoveredSeriesDates?: string[];
};

type FormAction = (formData: FormData) => void;
type ActionChannel = "plan" | "series";

type DayProps = {
  date: string;
  today: string;
  isRecoveryDay: boolean;
  sessions: PlanSessionView[];
  expectedRevision: number;
  action: FormAction;
  pending: boolean;
};

export function PlanManager({
  today,
  dates,
  expectedRevision,
  sessions,
  recoveryDates,
  savedSessions = [],
  uncoveredSeriesDates = [],
}: Props) {
  const [state, action, pending] = useActionState(
    changePlanAction,
    INITIAL_PLAN_ACTION_STATE,
  );
  const [seriesState, seriesAction, seriesPending] = useActionState(
    changeSeriesAction,
    INITIAL_SERIES_ACTION_STATE,
  );
  const [latestActionChannel, setLatestActionChannel] =
    useState<ActionChannel | null>(null);
  const trackedPlanAction = useCallback(
    (formData: FormData) => {
      setLatestActionChannel("plan");
      action(formData);
    },
    [action],
  );
  const trackedSeriesAction = useCallback(
    (formData: FormData) => {
      setLatestActionChannel("series");
      seriesAction(formData);
    },
    [seriesAction],
  );
  const stall = useMutationStall(pending, state.submission);
  const recovered = useRecoveredReload(state.submission);
  const seriesStall = useSeriesMutationStall(
    seriesPending,
    seriesState.submission,
    SERIES_RECOVERY_FLAG,
  );
  const seriesRecovered = useSeriesRecoveredReload(
    seriesState.submission,
    SERIES_RECOVERY_FLAG,
  );
  const seriesNotice =
    seriesStallNotice(seriesStall) ??
    (seriesPending ? "Saving recurring-session change…" : null) ??
    (seriesRecovered
      ? "The Plan was reloaded after a recurring-session response was lost. What you see is what is saved."
      : seriesState.status === "idle"
        ? null
        : seriesState.message);
  const showSeriesNotice =
    latestActionChannel === "series" ||
    (latestActionChannel === null && seriesNotice !== null);
  const planNotice =
    stallNotice(stall) ??
    (pending ? "Saving plan change…" : null) ??
    (recovered ? RECOVERED_NOTICE : null);
  const activeNotice = showSeriesNotice ? seriesNotice : planNotice;
  const seriesFirstNoticeState =
    seriesStall ??
    (seriesRecovered
      ? "recovered"
      : seriesState.status !== "idle"
        ? seriesState.status
        : (stall ?? (recovered ? "recovered" : state.status)));
  const noticeState = showSeriesNotice
    ? seriesFirstNoticeState
    : (stall ?? (recovered ? "recovered" : state.status));
  const showReload = showSeriesNotice
    ? seriesState.status === "conflict" ||
      seriesState.status === "session" ||
      seriesStall === "unconfirmed"
    : state.conflict === "stale" ||
      state.conflict === "timezone" ||
      stall === "unconfirmed";
  const labelled = new Set(recoveryDates);

  return (
    <div className={styles.manager}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {activeNotice ?? (showSeriesNotice ? "" : state.message)}
      </p>
      {showReload ? (
        <a className={styles.reload} href="/home/plan">
          Reload the current plan
        </a>
      ) : null}

      <SeriesMaterializer
        expectedRevision={expectedRevision}
        uncoveredDates={uncoveredSeriesDates}
      />

      <CreateSession
        dates={dates}
        savedSessions={savedSessions}
        expectedRevision={expectedRevision}
        planAction={trackedPlanAction}
        planState={state}
        planPending={pending}
        seriesAction={trackedSeriesAction}
        seriesState={seriesState}
        seriesPending={seriesPending}
      />

      <ol className={styles.days}>
        {dates.map((date) => (
          <PlanDay
            key={date}
            date={date}
            today={today}
            isRecoveryDay={labelled.has(date)}
            sessions={sessions.filter((session) => session.localDate === date)}
            expectedRevision={expectedRevision}
            action={trackedPlanAction}
            pending={pending}
          />
        ))}
      </ol>
    </div>
  );
}

function PlanDay({
  date,
  today,
  isRecoveryDay,
  sessions,
  expectedRevision,
  action,
  pending,
}: DayProps) {
  const active = sessions
    .filter((session) => session.status === "active" && !readsAsLogged(session))
    .toSorted((left, right) => left.position - right.position);
  const cancelled = sessions.filter(
    (session) => session.status === "cancelled" && !session.log,
  );
  const logged = sessions
    .filter(readsAsLogged)
    .toSorted((left, right) => left.position - right.position);
  const headingId = `plan-day-${date}`;

  return (
    <li
      className={styles.day}
      data-plan-date={date}
      data-today={date === today}
      data-recovery={isRecoveryDay}
    >
      <div className={styles.rail}>
        <p className={styles.dayStamp} id={headingId}>
          {stampDate(date)}
        </p>
        {date === today ? <p className={styles.dayMark}>Today</p> : null}
        {isRecoveryDay ? (
          <p className={styles.recoveryStamp}>Recovery</p>
        ) : null}
      </div>
      <div className={styles.dayBody}>
        {active.length ? (
          <ol className={styles.sessionList} aria-labelledby={headingId}>
            {active.map((session) => (
              <PlanSessionCard key={session.id} session={session} />
            ))}
          </ol>
        ) : logged.length ? null : (
          <p className={styles.empty}>
            {isRecoveryDay
              ? "Recovery day. Nothing is planned here."
              : "Nothing planned."}
          </p>
        )}

        {logged.length ? (
          <ol className={styles.sessionList}>
            {logged.map(({ log, ...session }) => (
              <li key={session.id} className={styles.session} data-logged>
                <SessionLink session={session} />
                <p className={styles.meta}>
                  {session.sport} · {COMPLETION_OUTCOME_LABELS[log.outcome]}
                  {log.actualLocalDate === session.localDate
                    ? null
                    : ` on ${stampDate(log.actualLocalDate)}`}
                </p>
              </li>
            ))}
          </ol>
        ) : null}

        {cancelled.length ? (
          <>
            <p className={styles.sectionLabel}>Cancelled</p>
            <ol className={styles.sessionList}>
              {cancelled.map((session) => (
                <li
                  key={session.id}
                  className={styles.session}
                  data-cancelled="true"
                >
                  <SessionLink session={session} />
                  <p className={styles.meta}>
                    {session.sport} · Cancelled, kept on the record
                  </p>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        <div className={styles.dayControls}>
          <form action={action}>
            <input type="hidden" name="operation" value="set_recovery_day" />
            <input type="hidden" name="localDate" value={date} />
            <input
              type="hidden"
              name="isRecoveryDay"
              value={isRecoveryDay ? "false" : "true"}
            />
            <input
              type="hidden"
              name="expectedRevision"
              value={expectedRevision}
            />
            <button className={styles.action} type="submit" disabled={pending}>
              {isRecoveryDay ? "Clear recovery day" : "Mark recovery day"}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

/**
 * A card reads the session and opens it (owner, 29 Sep 2026): every verb —
 * Edit, Cancel, Delete, Lock, Duplicate, Save to library — lives on the
 * session's own page, so the Plan is a list you read rather than a wall of
 * controls. The title is the link, and its hit area is stretched over the
 * whole card, so a tap anywhere on the card opens it.
 */
function PlanSessionCard({ session }: { session: PlanSessionView }) {
  return (
    <li
      className={styles.session}
      data-locked={session.isLocked}
      data-session-card
    >
      <SessionLink session={session}>
        <div className={styles.sessionMarks}>
          {session.seriesId === null ? null : (
            <span className={styles.seriesMark}>Recurring</span>
          )}
          {session.hasDiverged ? (
            <span className={styles.changedMark}>Changed</span>
          ) : null}
          {session.isLocked ? (
            <span className={styles.lockMark}>Locked</span>
          ) : null}
        </div>
      </SessionLink>
      <p className={styles.meta}>
        {[
          session.sport,
          session.expectedDurationMinutes === null
            ? null
            : `${session.expectedDurationMinutes} min`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {session.intent === null ? null : (
        <p className={styles.body}>{session.intent}</p>
      )}
      {session.note === null ? null : (
        <p className={styles.body}>{session.note}</p>
      )}
      <ActivityList
        label="Activities"
        items={session.activities.map((activity, index) => ({
          key: String(index),
          name: activity.name,
          detail: describeMeasurement(activity.target),
        }))}
      />
    </li>
  );
}

function SessionLink({
  session,
  children,
}: {
  session: Pick<PlanSessionView, "id" | "title">;
  children?: ReactNode;
}) {
  return (
    <div className={styles.sessionHeader}>
      <h3>
        <Link className={styles.cardLink} href={sessionHref(session.id)}>
          {session.title}
        </Link>
      </h3>
      {children}
    </div>
  );
}
