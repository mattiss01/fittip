"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionDraft,
  type PlanActionState,
} from "./action-state";
import { changePlanAction } from "./actions";
import { CreateSession } from "./create-session";
import styles from "./plan.module.css";
import {
  occurrenceHasFutureRuleDate,
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
  activityCount: number;
  seriesId: string | null;
  occurrenceDate: string | null;
  hasDiverged: boolean;
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
  const active = sessions
    .filter((session) => session.status === "active")
    .toSorted((left, right) => left.position - right.position);
  const cancelled = sessions.filter(
    (session) => session.status === "cancelled",
  );
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
        ) : (
          <p className={styles.empty}>
            {isRecoveryDay
              ? "Recovery day. Nothing is planned here."
              : "Nothing planned."}
          </p>
        )}

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
                  {/* The one control a cancelled session still needs: the
                      owner who cancelled it may next want it gone entirely. */}
                  <div className={styles.cardActions} data-session-actions>
                    <DeleteSession
                      sessionId={session.id}
                      expectedRevision={expectedRevision}
                      action={action}
                      pending={pending}
                      scope={deleteScope(
                        occurrenceOf(session, seriesById),
                        today,
                      )}
                      isCancelled
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
          session.activityCount > 0
            ? `${session.activityCount} ${session.activityCount === 1 ? "activity" : "activities"}`
            : null,
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

      <div className={styles.cardActions} data-session-actions>
        <details className={styles.disclosure}>
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
                }}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={action}
                planPending={pending}
                seriesAction={seriesAction}
                seriesState={seriesState}
                seriesPending={seriesPending}
              />
            )}

            {moveDates.length > 0 ? (
              <section className={styles.scope}>
                <h4>Move session</h4>
                <form className={styles.form} action={action}>
                  <input type="hidden" name="operation" value="move" />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={expectedRevision}
                  />
                  <div className={styles.field}>
                    <label htmlFor={`move-${session.id}`}>Move to</label>
                    <select
                      id={`move-${session.id}`}
                      name="localDate"
                      defaultValue={moveDates[0]}
                    >
                      {moveDates.map((date) => (
                        <option key={date} value={date}>
                          {stampDate(date)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {recurring === null ? null : (
                    <p className={styles.consequenceStandalone}>
                      Only this session moves. It becomes changed, and the new
                      date must stay inside this series segment.
                    </p>
                  )}
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={pending}
                  >
                    Move session
                  </button>
                </form>
              </section>
            ) : null}

            <section className={styles.scope}>
              <h4>Duplicate session</h4>
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
            </section>

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
                }}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={action}
                planPending={pending}
                seriesAction={seriesAction}
                seriesState={seriesState}
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
          scope={deleteScope(recurring, today)}
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
 * The occurrence identity of a session, or null when it has none the surface
 * can act on. A session naming a series the page did not load is treated as a
 * one-off here for the same reason `PlanSessionCard` already treats it as one:
 * without the segment's dates nothing about its rule can be stated truthfully.
 */
function occurrenceOf(
  session: PlanSessionView,
  seriesById: Map<string, PlanSeriesView>,
) {
  const segment =
    session.seriesId === null ? undefined : seriesById.get(session.seriesId);
  return segment !== undefined && session.occurrenceDate !== null
    ? { series: segment, occurrenceDate: session.occurrenceDate }
    : null;
}

/**
 * Which of the three things delete does to this session. It defers to the same
 * predicate the series-removal control uses, so the warning can quote that
 * control by name without ever naming one the owner cannot see.
 */
function deleteScope(
  recurring: { series: PlanSeriesView; occurrenceDate: string } | null,
  today: string,
): DeleteScope {
  if (recurring === null) return "one-off";
  return occurrenceHasFutureRuleDate(
    recurring.occurrenceDate,
    recurring.series,
    today,
  )
    ? "refilled-occurrence"
    : "settled-occurrence";
}

type DeleteScope = "one-off" | "refilled-occurrence" | "settled-occurrence";

/**
 * The second of the two removal verbs. It sits behind its own disclosure for
 * the same reason cancel does: neither destructive verb should be one stray tap
 * away on a phone, and holding them apart is what keeps their labels honest.
 *
 * Three sessions are told three different things, because delete does three
 * different things to them.
 *
 * Deleting a one-off is permanent. Deleting an occurrence whose rule date is
 * still ahead is not: the top-up that follows every plan change sees that date
 * uncovered and writes the occurrence straight back, in the same request. The
 * product owner accepted that on 29 August 2026 rather than withhold the
 * control, so the copy says it, and says the cancelled case loudest, because
 * there deleting reverses a decision the owner already made.
 *
 * An occurrence whose rule date has fallen behind today - which is reachable
 * by moving one forward and waiting - is permanent again, because the
 * materializer fills only `today .. today + 13`. `scope` carries which of the
 * three this is, decided by the one predicate the series-removal control uses,
 * so the copy never promises a refill that will not happen nor names a control
 * that is not on screen.
 */
function DeleteSession({
  sessionId,
  expectedRevision,
  action,
  pending,
  scope,
  isCancelled = false,
}: {
  sessionId: string;
  expectedRevision: number;
  action: FormAction;
  pending: boolean;
  scope: DeleteScope;
  isCancelled?: boolean;
}) {
  return (
    <details className={styles.disclosure}>
      <summary>Delete</summary>
      <div className={styles.editorPanel}>
        <p className={styles.permanentConsequence}>
          {deleteWarning(scope, isCancelled)} A session you have logged training
          against cannot be deleted; cancel it instead.
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
      </div>
    </details>
  );
}

const ONE_OFF_WARNING =
  "Permanent. Deleting removes this session from the plan and does not keep it on the record. There is no undo.";

/**
 * What the owner loses when the series writes an occurrence back. It returns as
 * the rule describes it, so anything the owner had made this one occurrence
 * mean is gone: an edited title, note or duration, an edited activity list, the
 * lock, and the date a moved occurrence was sitting on. Naming the rule date is
 * the point of the last clause - "writes the date back" would otherwise read as
 * this card's date, which for a moved occurrence it is not.
 */
const OCCURRENCE_REFILL_LOSS =
  "What comes back is what the series says, not what you see here: a title, note, duration or activity list you had changed is replaced, the lock is cleared, and a session you had moved reappears on the series date rather than this one.";

/**
 * The way out, in the words on the control rather than in ours. The button that
 * stops the date returning is inside the Cancel panel and reads exactly this,
 * so the copy quotes it instead of describing it.
 */
const OCCURRENCE_REFILL_ESCAPE =
  "To stop the date coming back, use “Remove this and all future sessions” under Cancel";

/**
 * An occurrence the series has stopped filling. Its rule date is behind today
 * or outside its segment, so the delete is as permanent as a one-off's. The
 * added clause exists because an owner who has read the warning on another
 * occurrence would otherwise expect this one to come back too, and because the
 * control that warning points at is not rendered here.
 */
const SETTLED_OCCURRENCE_WARNING =
  ONE_OFF_WARNING +
  " Its series will not write this date back, because the date it repeats on is no longer one the series fills.";

/**
 * What deleting an occurrence really does, in the owner's terms. Both branches
 * describe the refill and the loss, because both happen either way; the
 * cancelled branch leads with the consequence the owner would not expect, and
 * sends them to a control that only the returned session carries.
 */
function deleteWarning(scope: DeleteScope, isCancelled: boolean) {
  if (scope === "one-off") return ONE_OFF_WARNING;
  if (scope === "settled-occurrence") return SETTLED_OCCURRENCE_WARNING;
  const opening = isCancelled
    ? "This session repeats, so deleting it will not keep it deleted: its series writes the occurrence back in the same step, and it comes back active. Deleting a cancelled occurrence undoes your cancellation."
    : "This session repeats, so deleting it will not keep it deleted: its series writes the occurrence back in the same step.";
  const escape = isCancelled
    ? OCCURRENCE_REFILL_ESCAPE + " on the session that returns."
    : OCCURRENCE_REFILL_ESCAPE + " instead.";
  return opening + " " + OCCURRENCE_REFILL_LOSS + " " + escape;
}

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
