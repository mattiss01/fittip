"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionDraft,
  type PlanActionState,
} from "./action-state";
import { changePlanAction } from "./actions";
import {
  COMPLETION_OUTCOME_LABELS,
  type CompletionOutcome,
} from "../log/log-action-state";
import { CreateSession } from "./create-session";
import { ActivityList } from "@/components/training/activity-list";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import styles from "./plan.module.css";
import {
  RecurringDeleteControls,
  RecurringSessionControls,
  type PlanSeriesView,
} from "./recurring-session-controls";
import { SaveToLibrary } from "./saved/save-to-library";
import {
  INITIAL_SERIES_ACTION_STATE,
  type SeriesActionState,
} from "./series-action-state";
import { changeSeriesAction } from "./series-actions";
import { SeriesMaterializer } from "./series-materializer";
import { SessionFields } from "./session-fields";

import type { ActivityValue } from "@/components/training/activity-editor";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "./series-transition-watch";

import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  watchTransition,
  WATCH_INTERVAL_MS,
  type TransitionWatch,
} from "@/lib/app-router/transition-watchdog";

export type PlanSessionView = {
  id: string;
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  isLocked: boolean;
  status: "active" | "cancelled";
  /** The rows the edit form binds, and the list the card prints. */
  activities: ActivityValue[];
  seriesId: string | null;
  occurrenceDate: string | null;
  hasDiverged: boolean;
  /**
   * The log attached to this session, on whatever day it was written. A logged
   * session reads as logged here, with no plan controls: one trained on
   * another day is not still ahead, and a cancelled one trained anyway is not
   * cancelled. The plan row and the log's snapshot keep what the plan said.
   */
  log?: PlanSessionLog;
};

export type PlanSessionLog = {
  completionId: string;
  outcome: CompletionOutcome;
  actualLocalDate: string;
};

type Props = {
  today: string;
  /** Owner-local dates this surface reads and writes, ascending. */
  dates: string[];
  expectedRevision: number;
  sessions: PlanSessionView[];
  recoveryDates: string[];
  series?: PlanSeriesView[];
  uncoveredSeriesDates?: string[];
};

type FormAction = (formData: FormData) => void;
type ActionChannel = "plan" | "series";

type DayProps = {
  date: string;
  today: string;
  dates: string[];
  isRecoveryDay: boolean;
  sessions: PlanSessionView[];
  expectedRevision: number;
  action: FormAction;
  state: PlanActionState;
  pending: boolean;
  seriesById: Map<string, PlanSeriesView>;
  seriesAction: FormAction;
  seriesState: SeriesActionState;
  seriesPending: boolean;
};

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no plan content, only the fact that the reload was
 * self-triggered.
 */
const RECOVERY_FLAG = "fittip.plan.recovered:v1";
const SERIES_RECOVERY_FLAG = "fittip.plan.series-change.recovered:v1";

const RECOVERED_NOTICE =
  "Your last plan change did not appear, so the plan was reloaded. What you see below is what is saved.";

export function PlanManager({
  today,
  dates,
  expectedRevision,
  sessions,
  recoveryDates,
  series = [],
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
  const seriesById = new Map(series.map((segment) => [segment.id, segment]));

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
            dates={dates}
            isRecoveryDay={labelled.has(date)}
            sessions={sessions.filter((session) => session.localDate === date)}
            expectedRevision={expectedRevision}
            action={trackedPlanAction}
            state={state}
            pending={pending}
            seriesById={seriesById}
            seriesAction={trackedSeriesAction}
            seriesState={seriesState}
            seriesPending={seriesPending}
          />
        ))}
      </ol>
    </div>
  );
}

function PlanDay({
  date,
  today,
  dates,
  isRecoveryDay,
  sessions,
  expectedRevision,
  action,
  state,
  pending,
  seriesById,
  seriesAction,
  seriesState,
  seriesPending,
}: DayProps) {
  // A session reads as logged when the log settles what the plan still
  // shows: trained on another day, so it is not still ahead here, or trained
  // after it was cancelled. Logged on its own day, it keeps its card and its
  // controls, which is where a series is ended from.
  const readsAsLogged = (session: PlanSessionView) =>
    session.log !== undefined &&
    (session.status === "cancelled" ||
      session.log.actualLocalDate !== session.localDate);
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
  const cancelledOccurrenceDelete = (session: PlanSessionView) => {
    const segment =
      session.seriesId === null ? undefined : seriesById.get(session.seriesId);
    if (segment === undefined || session.occurrenceDate === null) return;
    return (
      <RecurringDeleteControls
        today={today}
        sessionId={session.id}
        occurrenceDate={session.occurrenceDate}
        series={segment}
        expectedRevision={expectedRevision}
        planAction={action}
        planPending={pending}
        seriesAction={seriesAction}
        seriesState={seriesState}
        seriesPending={seriesPending}
      />
    );
  };

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
              <PlanSessionCard
                key={session.id}
                session={session}
                dates={dates}
                expectedRevision={expectedRevision}
                action={action}
                state={state}
                pending={pending}
                today={today}
                series={
                  session.seriesId === null
                    ? undefined
                    : seriesById.get(session.seriesId)
                }
                seriesAction={seriesAction}
                seriesState={seriesState}
                seriesPending={seriesPending}
              />
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
                <div className={styles.sessionHeader}>
                  <h3>{session.title}</h3>
                </div>
                <p className={styles.meta}>
                  {session.sport} · {COMPLETION_OUTCOME_LABELS[log!.outcome]}
                  {log!.actualLocalDate === session.localDate
                    ? null
                    : ` on ${stampDate(log!.actualLocalDate)}`}
                </p>
                <div className={styles.cardActions} data-session-actions>
                  <Link
                    className={styles.action}
                    href={`/home/log?completion=${log!.completionId}`}
                  >
                    Edit log
                  </Link>
                </div>
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
                  <div className={styles.sessionHeader}>
                    <h3>{session.title}</h3>
                  </div>
                  <p className={styles.meta}>
                    {session.sport} · Cancelled, kept on the record
                  </p>
                  {/* A cancelled session admits two verbs: back into the plan,
                      or gone entirely. Everything else waits until it is
                      active again. */}
                  <div className={styles.cardActions} data-session-actions>
                    <ReactivateSession
                      sessionId={session.id}
                      expectedRevision={expectedRevision}
                      action={action}
                      pending={pending}
                    />
                    <DeleteSession
                      sessionId={session.id}
                      expectedRevision={expectedRevision}
                      action={action}
                      pending={pending}
                      occurrence={cancelledOccurrenceDelete(session)}
                    />
                  </div>
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

function PlanSessionCard({
  session,
  dates,
  expectedRevision,
  action,
  state,
  pending,
  today,
  series,
  seriesAction,
  seriesState,
  seriesPending,
}: {
  session: PlanSessionView;
  dates: string[];
  expectedRevision: number;
  action: FormAction;
  state: PlanActionState;
  pending: boolean;
  today: string;
  series?: PlanSeriesView;
  seriesAction: FormAction;
  seriesState: SeriesActionState;
  seriesPending: boolean;
}) {
  const recurring =
    series !== undefined && session.occurrenceDate !== null
      ? { series, occurrenceDate: session.occurrenceDate }
      : null;
  const moveDates = dates.filter(
    (date) =>
      date !== session.localDate &&
      (series === undefined ||
        (date >= series.startDate &&
          (series.endDate === null || date <= series.endDate))),
  );
  const editResetKey = useTargetedResetKey(
    state.submission,
    state.operation === "edit" && state.sessionId === session.id,
  );
  const [editOpen, setEditOpen] = useEditDisclosure(state, session.id);

  return (
    <li className={styles.session} data-locked={session.isLocked}>
      <div className={styles.sessionHeader}>
        <h3>{session.title}</h3>
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
      </div>
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

      <div className={styles.cardActions} data-session-actions>
        <details
          className={styles.disclosure}
          open={editOpen}
          onToggle={(event) => setEditOpen(event.currentTarget.open)}
        >
          <summary>Edit</summary>
          <div className={styles.editorPanel}>
            {recurring === null ? (
              <form
                className={styles.form}
                action={action}
                key={`edit-${session.id}-${editResetKey}`}
              >
                <input type="hidden" name="operation" value="edit" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedRevision}
                />
                <SessionFields
                  idPrefix={`edit-${session.id}`}
                  draft={
                    draftFor(state, "edit", session.id) ?? draftOf(session)
                  }
                  activities={session.activities}
                  dateField={
                    <div className={styles.field}>
                      <label htmlFor={`edit-date-${session.id}`}>Date</label>
                      <select
                        id={`edit-date-${session.id}`}
                        name="localDate"
                        defaultValue={session.localDate}
                      >
                        {[session.localDate, ...moveDates]
                          .sort()
                          .map((date) => (
                            <option key={date} value={date}>
                              {stampDate(date)}
                            </option>
                          ))}
                      </select>
                      {recurring === null ? null : (
                        <p className={styles.consequenceStandalone}>
                          Only this session moves. It becomes changed, and the
                          new date must stay inside this series segment.
                        </p>
                      )}
                    </div>
                  }
                />
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={pending}
                >
                  Save session
                </button>
              </form>
            ) : (
              <RecurringSessionControls
                mode="edit"
                today={today}
                session={{
                  id: session.id,
                  occurrenceDate: recurring.occurrenceDate,
                  isLocked: session.isLocked,
                  title: session.title,
                  sport: session.sport,
                  intent: session.intent,
                  expectedDurationMinutes: session.expectedDurationMinutes,
                  note: session.note,
                  activities: session.activities,
                }}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={action}
                planPending={pending}
                seriesAction={seriesAction}
                seriesPending={seriesPending}
              />
            )}

            <details className={styles.disclosure}>
              <summary>Duplicate</summary>
              <form className={styles.form} action={action}>
                <input type="hidden" name="operation" value="duplicate" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedRevision}
                />
                <div className={styles.field}>
                  <label htmlFor={`duplicate-${session.id}`}>Copy to</label>
                  <select
                    id={`duplicate-${session.id}`}
                    name="localDate"
                    defaultValue={session.localDate}
                  >
                    {dates.map((date) => (
                      <option key={date} value={date}>
                        {stampDate(date)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className={styles.consequence}>
                  The copy is a new session. It starts unlocked and carries none
                  of this session&rsquo;s history.
                </p>
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={pending}
                >
                  Duplicate session
                </button>
              </form>
            </details>

            <SaveToLibrary sessionId={session.id} defaultName={session.title} />
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary>Cancel</summary>
          <div className={styles.editorPanel}>
            {recurring === null ? (
              <>
                <p className={styles.consequence}>
                  Cancelling keeps the session on the record as cancelled. It
                  stops being part of what you plan to do, and you can still
                  delete it afterwards.
                </p>
                <form className={styles.form} action={action}>
                  <input type="hidden" name="operation" value="cancel" />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={expectedRevision}
                  />
                  <button
                    className={styles.action}
                    type="submit"
                    disabled={pending}
                  >
                    Cancel session
                  </button>
                </form>
              </>
            ) : (
              <RecurringSessionControls
                mode="remove"
                today={today}
                session={{
                  id: session.id,
                  occurrenceDate: recurring.occurrenceDate,
                  isLocked: session.isLocked,
                  title: session.title,
                  sport: session.sport,
                  intent: session.intent,
                  expectedDurationMinutes: session.expectedDurationMinutes,
                  note: session.note,
                  activities: session.activities,
                }}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={action}
                planPending={pending}
                seriesAction={seriesAction}
                seriesPending={seriesPending}
              />
            )}
          </div>
        </details>

        <DeleteSession
          sessionId={session.id}
          expectedRevision={expectedRevision}
          action={action}
          pending={pending}
          occurrence={
            recurring === null ? undefined : (
              <RecurringDeleteControls
                today={today}
                sessionId={session.id}
                occurrenceDate={recurring.occurrenceDate}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={action}
                planPending={pending}
                seriesAction={seriesAction}
                seriesState={seriesState}
                seriesPending={seriesPending}
              />
            )
          }
        />

        <form action={action}>
          <input type="hidden" name="operation" value="set_lock" />
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            type="hidden"
            name="isLocked"
            value={session.isLocked ? "false" : "true"}
          />
          <input
            type="hidden"
            name="expectedRevision"
            value={expectedRevision}
          />
          <button className={styles.action} type="submit" disabled={pending}>
            {session.isLocked ? "Unlock" : "Lock"}
          </button>
        </form>
      </div>
    </li>
  );
}

/**
 * Reactivate is not destructive, so unlike cancel and delete it is one tap and
 * no disclosure. The session returns after the day's last active one, because
 * cancelling gave its place away; Move is there afterwards if it should not.
 */
function ReactivateSession({
  sessionId,
  expectedRevision,
  action,
  pending,
}: {
  sessionId: string;
  expectedRevision: number;
  action: FormAction;
  pending: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="operation" value="reactivate" />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <button className={styles.action} type="submit" disabled={pending}>
        Reactivate
      </button>
    </form>
  );
}

/**
 * The second of the two removal verbs. It sits behind its own disclosure for
 * the same reason cancel does: neither destructive verb should be one stray tap
 * away on a phone, and holding them apart is what keeps their labels honest.
 *
 * Deleting is permanent for every session. An occurrence says one thing more,
 * because an owner who knows the series fills its dates would otherwise expect
 * this one back: since M3-20 the series records the date and leaves it empty.
 */
function DeleteSession({
  sessionId,
  expectedRevision,
  action,
  pending,
  occurrence,
}: {
  sessionId: string;
  expectedRevision: number;
  action: FormAction;
  pending: boolean;
  /** An occurrence's two scopes, which replace the one-off's single form. */
  occurrence?: ReactNode;
}) {
  return (
    <details className={styles.disclosure}>
      <summary>Delete</summary>
      <div className={styles.editorPanel}>
        {occurrence ?? (
          <>
            <p className={styles.permanentConsequence}>
              {ONE_OFF_WARNING} A session you have logged training against
              cannot be deleted; cancel it instead.
            </p>
            <form className={styles.form} action={action}>
              <input type="hidden" name="operation" value="delete" />
              <input type="hidden" name="sessionId" value={sessionId} />
              <input
                type="hidden"
                name="expectedRevision"
                value={expectedRevision}
              />
              <button
                className={styles.dangerAction}
                type="submit"
                disabled={pending}
              >
                Delete session
              </button>
            </form>
          </>
        )}
      </div>
    </details>
  );
}

const ONE_OFF_WARNING =
  "Permanent. Deleting removes this session from the plan and does not keep it on the record. There is no undo.";

/**
 * A remount key that advances only when a submission targeted *this* form.
 *
 * The forms are uncontrolled, so remounting is how a saved one is cleared and
 * how a refused one is re-seeded from the returned draft. Keying on the global
 * submission counter did both of those correctly and also remounted every other
 * edit form on the surface: marking a recovery day could close another open
 * editor and discard whatever had been typed into it. Advancing per target
 * keeps the reset and loses nothing else.
 *
 * The value is adjusted during render rather than in an effect, so the remount
 * happens in the same commit as the result that caused it.
 */
/**
 * Whether this session's Edit panel is open, closing it once the save it was
 * holding has landed.
 *
 * A `<details>` left to itself stays open across a Server Action: the action
 * revalidates the route, React reconciles the same element, and the owner is
 * returned to the form they have just finished with rather than to the card
 * showing what they saved. So it is controlled.
 *
 * The close happens during render against a submission number, which is the
 * pattern `useTargetedResetKey` and the create form's reset key already use
 * here. An effect would work too and would cost a second render to do the same
 * thing — and would reopen the panel for anyone who had already reopened it
 * themselves before the effect ran.
 */
function useEditDisclosure(
  state: PlanActionState,
  sessionId: string,
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(0);
  const savedHere =
    state.status === "saved" &&
    state.operation === "edit" &&
    state.sessionId === sessionId;
  if (savedHere && state.submission !== settled) {
    setSettled(state.submission);
    if (open) setOpen(false);
  }
  return [open, setOpen];
}

function useTargetedResetKey(submission: number, targeted: boolean): number {
  const [seen, setSeen] = useState(0);
  if (targeted && submission !== seen) setSeen(submission);
  return targeted ? submission : seen;
}

function draftOf(session: PlanSessionView): PlanActionDraft {
  return {
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? "",
    expectedDurationMinutes:
      session.expectedDurationMinutes === null
        ? ""
        : String(session.expectedDurationMinutes),
    note: session.note ?? "",
  };
}

/** Returns what the owner typed only for the exact form that was refused. */
function draftFor(
  state: PlanActionState,
  operation: "add" | "edit",
  target: string,
): PlanActionDraft | undefined {
  if (state.operation !== operation || !state.draft) return undefined;
  const owner = operation === "add" ? state.localDate : state.sessionId;
  return owner === target ? state.draft : undefined;
}

function stampDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

/**
 * A mutation whose reply never reaches the surface. See
 * `@/lib/app-router/transition-watchdog` for what these two verdicts can and
 * cannot honestly claim; this action answers 200 for every outcome, so neither
 * verdict ever says the change saved.
 */
type MutationStall = Exclude<TransitionWatch, "waiting">;

function useMutationStall(
  pending: boolean,
  submission: number,
): MutationStall | null {
  const [stall, setStall] = useState<{
    key: string;
    verdict: MutationStall;
  } | null>(null);
  const respondedAt = useRef<number | null>(null);
  const consumedAt = useRef<number | null>(null);
  const key = `${submission}:${pending}`;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (seen === null) return;
      if (respondedAt.current === null || seen > respondedAt.current) {
        respondedAt.current = seen;
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    markRecovered(false);
    const submittedAt = performance.now();
    let reload = 0;
    const interval = window.setInterval(() => {
      const verdict = watchTransition({
        submittedAt,
        respondedAt: respondedAt.current,
        consumedAt: consumedAt.current,
        now: performance.now(),
      });
      if (verdict === "waiting") return;
      window.clearInterval(interval);
      setStall({ key, verdict });
      if (verdict === "lost-render") {
        markRecovered(true);
        reload = window.setTimeout(
          () => window.location.reload(),
          RECOVERY_NOTICE_MS,
        );
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [key, pending]);

  return stall?.key === key ? stall.verdict : null;
}

function useRecoveredReload(submission: number): boolean {
  const recovered = useSyncExternalStore(
    subscribeNothing,
    readRecovered,
    () => false,
  );
  return recovered && submission === 0;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch {
    return false;
  }
}

function markRecovered(recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}

function stallNotice(stall: TransitionWatch | null) {
  if (stall === "lost-render") {
    return "This plan change did not appear. Reloading the plan to show what is saved.";
  }
  if (stall === "unconfirmed") {
    return "This plan change has not been confirmed. Reload to see whether it was saved.";
  }
  return null;
}
