"use client";

import {
  useActionState,
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
import styles from "./plan.module.css";

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
};

type Props = {
  today: string;
  /** Owner-local dates this surface reads and writes, ascending. */
  dates: string[];
  expectedRevision: number;
  sessions: PlanSessionView[];
  recoveryDates: string[];
};

type FormAction = (formData: FormData) => void;

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
};

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no plan content, only the fact that the reload was
 * self-triggered.
 */
const RECOVERY_FLAG = "fittip.plan.recovered:v1";

const RECOVERED_NOTICE =
  "Your last plan change did not appear, so the plan was reloaded. What you see below is what is saved.";

export function PlanManager({
  today,
  dates,
  expectedRevision,
  sessions,
  recoveryDates,
}: Props) {
  const [state, action, pending] = useActionState(
    changePlanAction,
    INITIAL_PLAN_ACTION_STATE,
  );
  const stall = useMutationStall(pending, state.submission);
  const recovered = useRecoveredReload(state.submission);
  const notice =
    stallNotice(stall) ??
    (pending ? "Saving plan change…" : null) ??
    (recovered ? RECOVERED_NOTICE : null);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);
  const labelled = new Set(recoveryDates);

  return (
    <div className={styles.manager}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice ?? state.message}
      </p>
      {state.conflict === "stale" ||
      state.conflict === "timezone" ||
      stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/plan">
          Reload the current plan
        </a>
      ) : null}

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
            action={action}
            state={state}
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
  dates,
  isRecoveryDay,
  sessions,
  expectedRevision,
  action,
  state,
  pending,
}: DayProps) {
  const active = sessions
    .filter((session) => session.status === "active")
    .toSorted((left, right) => left.position - right.position);
  const cancelled = sessions.filter(
    (session) => session.status === "cancelled",
  );
  const headingId = `plan-day-${date}`;
  const addResetKey = useTargetedResetKey(
    state.submission,
    state.operation === "add" && state.localDate === date,
  );

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
                </li>
              ))}
            </ol>
          </>
        ) : null}

        <details className={styles.disclosure}>
          <summary>Add a session</summary>
          <form
            className={styles.form}
            action={action}
            key={`add-${date}-${addResetKey}`}
          >
            <input type="hidden" name="operation" value="add" />
            <input type="hidden" name="localDate" value={date} />
            <input
              type="hidden"
              name="expectedRevision"
              value={expectedRevision}
            />
            <SessionFields
              idPrefix={`add-${date}`}
              draft={draftFor(state, "add", date)}
            />
            <button className={styles.primary} type="submit" disabled={pending}>
              Add session
            </button>
          </form>
        </details>

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
}: {
  session: PlanSessionView;
  dates: string[];
  expectedRevision: number;
  action: FormAction;
  state: PlanActionState;
  pending: boolean;
}) {
  const moveDates = dates.filter((date) => date !== session.localDate);
  const editResetKey = useTargetedResetKey(
    state.submission,
    state.operation === "edit" && state.sessionId === session.id,
  );

  return (
    <li className={styles.session} data-locked={session.isLocked}>
      <div className={styles.sessionHeader}>
        <h3>{session.title}</h3>
        {session.isLocked ? (
          <span className={styles.lockMark}>Locked</span>
        ) : null}
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

      <div className={styles.controls}>
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

      <details className={styles.disclosure}>
        <summary>Edit</summary>
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
            draft={draftFor(state, "edit", session.id) ?? draftOf(session)}
          />
          <button className={styles.primary} type="submit" disabled={pending}>
            Save session
          </button>
        </form>
      </details>

      <details className={styles.disclosure}>
        <summary>Move</summary>
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
          <button className={styles.primary} type="submit" disabled={pending}>
            Move session
          </button>
        </form>
      </details>

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
            The copy is a new session. It starts unlocked and carries none of
            this session&rsquo;s history.
          </p>
          <button className={styles.primary} type="submit" disabled={pending}>
            Duplicate session
          </button>
        </form>
      </details>

      <details className={styles.disclosure}>
        <summary>Cancel</summary>
        <p className={styles.consequence}>
          Cancelling keeps the session on the record as cancelled. It is not
          deleted, and it stops being part of what you plan to do.
        </p>
        <form className={styles.form} action={action}>
          <input type="hidden" name="operation" value="cancel" />
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            type="hidden"
            name="expectedRevision"
            value={expectedRevision}
          />
          <button className={styles.action} type="submit" disabled={pending}>
            Cancel session
          </button>
        </form>
      </details>
    </li>
  );
}

function SessionFields({
  idPrefix,
  draft,
}: {
  idPrefix: string;
  draft?: PlanActionDraft;
}) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          maxLength={120}
          required
          defaultValue={draft?.title ?? ""}
        />
      </div>
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sport`}>Sport</label>
          <input
            id={`${idPrefix}-sport`}
            name="sport"
            maxLength={80}
            required
            defaultValue={draft?.sport ?? ""}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-minutes`}>Minutes</label>
          <input
            id={`${idPrefix}-minutes`}
            name="expectedDurationMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={10080}
            defaultValue={draft?.expectedDurationMinutes ?? ""}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-intent`}>Intent</label>
        <input
          id={`${idPrefix}-intent`}
          name="intent"
          maxLength={500}
          defaultValue={draft?.intent ?? ""}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-note`}>Note</label>
        <textarea
          id={`${idPrefix}-note`}
          name="note"
          maxLength={2000}
          defaultValue={draft?.note ?? ""}
        />
      </div>
    </>
  );
}

/**
 * A remount key that advances only when a submission targeted *this* form.
 *
 * The forms are uncontrolled, so remounting is how a saved one is cleared and
 * how a refused one is re-seeded from the returned draft. Keying on the global
 * submission counter did both of those correctly and also remounted every other
 * add and edit form on the surface: marking a recovery day on the first date
 * closed an open "Add a session" on the twelfth and discarded whatever had been
 * typed into it. Advancing per target keeps the reset and loses nothing else.
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
