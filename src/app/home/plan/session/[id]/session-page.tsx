"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { INITIAL_PLAN_ACTION_STATE } from "../../action-state";
import { PlanDateInput, type PlanDateRange } from "../../plan-date-field";
import { changePlanAction } from "../../actions";
import { CancelReasonFields } from "../../cancel-reason-fields";
import { INITIAL_CANCELLATION_ACTION_STATE } from "../../cancellation-action-state";
import { setCancellationReasonAction } from "../../cancellation-actions";
import styles from "../../plan.module.css";
import {
  SESSION_RECOVERY_FLAG,
  SESSION_SERIES_RECOVERY_FLAG,
  stallNotice,
  useMutationStall,
  useRecoveredReload,
} from "../../plan-mutation-watch";
import {
  RecurringDeleteControls,
  RecurringSessionControls,
  type PlanSeriesView,
} from "../../recurring-session-controls";
import { SaveToLibrary } from "../../saved/save-to-library";
import { INITIAL_SERIES_ACTION_STATE } from "../../series-action-state";
import { changeSeriesAction } from "../../series-actions";
import {
  seriesStallNotice,
  useSeriesMutationStall,
  useSeriesRecoveredReload,
} from "../../series-transition-watch";
import { SessionFields } from "../../session-fields";
import {
  draftOf,
  planDayHref,
  sessionHref,
  stampDate,
  type PlanSessionView,
} from "../../session-view";

import page from "./session-page.module.css";

import {
  COMPLETION_OUTCOME_LABELS,
  recordsTraining,
} from "../../../log/log-action-state";
import { ActivityList } from "@/components/training/activity-list";
import { describeMeasurement } from "@/lib/training/describe-measurement";

export type SessionPageOrigin = "plan" | "today";

type Panel = "edit" | "duplicate" | "save" | "cancel" | "delete" | "reason";
type Channel = "plan" | "series";

const PANEL_HEADINGS: Record<Panel, string> = {
  edit: "Edit session",
  duplicate: "Duplicate",
  save: "Save to library",
  reason: "Why it was cancelled",
  cancel: "Cancel session",
  delete: "Delete session",
};

const ONE_OFF_WARNING =
  "Permanent. Deleting removes this session from the plan and does not keep it on the record. There is no undo.";

/**
 * A planned session on its own page: read first, changed on purpose (owner,
 * 29 Sep 2026). Edit is the one verb in plain sight because it is the one
 * used most; the rest sit behind ⋯, and the two destructive ones still open a
 * panel that says what they do before anything is sent.
 *
 * Every verb goes through the same two actions the Plan used, so what can be
 * changed, and when, is decided exactly where it was before.
 */
export function SessionPage({
  session,
  series,
  today,
  dateRange,
  expectedRevision,
  origin,
  originDate,
  cancellation = null,
}: {
  session: PlanSessionView | null;
  series?: PlanSeriesView;
  today: string;
  /** Where a single session may be moved or copied to. */
  dateRange: PlanDateRange;
  expectedRevision: number;
  origin: SessionPageOrigin;
  originDate: string | null;
  /** Why it was cancelled, read only for a cancelled session. */
  cancellation?: SessionCancellationView | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    changePlanAction,
    INITIAL_PLAN_ACTION_STATE,
  );
  const [seriesState, seriesAction, seriesPending] = useActionState(
    changeSeriesAction,
    INITIAL_SERIES_ACTION_STATE,
  );
  const [channel, setChannel] = useState<Channel | null>(null);
  const planAction = useCallback(
    (formData: FormData) => {
      setChannel("plan");
      action(formData);
    },
    [action],
  );
  const trackedSeriesAction = useCallback(
    (formData: FormData) => {
      setChannel("series");
      seriesAction(formData);
    },
    [seriesAction],
  );

  const stall = useMutationStall(
    pending,
    state.submission,
    SESSION_RECOVERY_FLAG,
  );
  const recovered = useRecoveredReload(state.submission, SESSION_RECOVERY_FLAG);
  const seriesStall = useSeriesMutationStall(
    seriesPending,
    seriesState.submission,
    SESSION_SERIES_RECOVERY_FLAG,
  );
  const seriesRecovered = useSeriesRecoveredReload(
    seriesState.submission,
    SESSION_SERIES_RECOVERY_FLAG,
  );

  const [panel, setPanel] = useState<Panel | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  // A save closes the panel it came from, during render against the
  // submission it answered, as the Plan's edit disclosure did: an effect would
  // cost a render and could close a panel the owner has since reopened.
  const [settled, setSettled] = useState({ plan: 0, series: 0 });
  if (state.status === "saved" && state.submission !== settled.plan) {
    setSettled((current) => ({ ...current, plan: state.submission }));
    setPanel(null);
  }
  if (
    seriesState.status === "saved" &&
    seriesState.submission !== settled.series
  ) {
    setSettled((current) => ({
      ...current,
      series: seriesState.submission,
    }));
    setPanel(null);
  }

  // The day to return to once this session is gone. Kept from the last read
  // that still had it, because the read after a delete has nothing.
  const [lastDate, setLastDate] = useState(session?.localDate ?? null);
  if (session !== null && session.localDate !== lastDate) {
    setLastDate(session.localDate);
  }
  const removedHere =
    (channel === "plan" &&
      state.status === "saved" &&
      state.operation === "delete") ||
    (channel === "series" &&
      seriesState.status === "saved" &&
      (seriesState.operation === "end_series" ||
        seriesState.operation === "edit_series"));
  const returnHref =
    origin === "today"
      ? `/home/today?date=${lastDate ?? originDate ?? today}`
      : lastDate === null
        ? "/home/plan"
        : planDayHref(lastDate);
  const gone = session === null && removedHere;
  // "This and future" can replace the occurrence this page was showing with
  // the successor series' own, so the page leaves after a save, not a removal.
  const replacedBySeriesEdit =
    channel === "series" && seriesState.operation === "edit_series";
  const returnLabel = origin === "today" ? "Today" : "the Plan";
  useEffect(() => {
    if (gone) router.replace(returnHref);
  }, [gone, returnHref, router]);

  const showSeries =
    channel === "series" ||
    (channel === null && (seriesStall !== null || seriesRecovered));
  const notice = showSeries
    ? (seriesStallNotice(seriesStall) ??
      (seriesPending ? "Saving recurring-session change…" : null) ??
      (seriesRecovered
        ? "The session was reloaded after a recurring-session response was lost. What you see is what is saved."
        : seriesState.message))
    : (stallNotice(stall) ??
      (pending ? "Saving plan change…" : null) ??
      (recovered
        ? "Your last change did not appear, so this session was reloaded. What you see is what is saved."
        : state.message));
  const noticeState = showSeries
    ? (seriesStall ??
      (seriesRecovered
        ? "recovered"
        : seriesPending
          ? "saving"
          : seriesState.status))
    : (stall ?? (recovered ? "recovered" : pending ? "saving" : state.status));
  const showReload = showSeries
    ? seriesState.status === "conflict" ||
      seriesState.status === "session" ||
      seriesStall === "unconfirmed"
    : state.conflict === "stale" ||
      state.conflict === "timezone" ||
      stall === "unconfirmed";
  const quiet = noticeState === "idle" || notice === "";

  const back = (
    <Link className={page.back} href={returnHref} data-back-link>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {origin === "today" ? "Today" : "Plan"}
    </Link>
  );

  if (session === null) {
    return (
      <>
        {back}
        <section
          className={page.missing}
          data-session-state={gone ? "removed" : "missing"}
          aria-live="polite"
        >
          {gone ? (
            <>
              <h1>
                {replacedBySeriesEdit ? "Change saved" : "Session removed"}
              </h1>
              <p>Taking you back to {returnLabel}.</p>
            </>
          ) : (
            <>
              <h1>That session is not there</h1>
              <p>
                It may have been deleted, or it is not one of yours. Nothing was
                changed.
              </p>
              <Link className={page.main} href={returnHref}>
                Back to {returnLabel}
              </Link>
            </>
          )}
        </section>
      </>
    );
  }

  const past = session.localDate < today;
  // Trained after it was cancelled, it reads as logged, not cancelled.
  const cancelled = session.status === "cancelled" && session.log === undefined;
  // Once anything is logged against it, the session is settled: its log is
  // what changes now, not its plan (owner, 3 Oct 2026). That includes a log
  // on its own day and a skip written ahead, which used to keep every plan
  // verb so a series could be ended from them; a series ends from an
  // occurrence nobody has logged.
  const plannable = !past && session.log === undefined && !cancelled;
  const recurring =
    series !== undefined && session.occurrenceDate !== null
      ? { series, occurrenceDate: session.occurrenceDate }
      : null;
  const logHref = session.log
    ? `/home/log?completion=${session.log.completionId}`
    : `/home/log?plannedSession=${session.id}&date=${session.localDate}`;
  const busy = pending || seriesPending;
  const recurringView = {
    id: session.id,
    occurrenceDate: recurring?.occurrenceDate ?? "",
    isLocked: session.isLocked,
    title: session.title,
    sport: session.sport,
    intent: session.intent,
    expectedDurationMinutes: session.expectedDurationMinutes,
    note: session.note,
    activities: session.activities,
    openFill: session.openFill,
  };

  const submit = (fields: Record<string, string>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    formData.set("sessionId", session.id);
    formData.set("expectedRevision", String(expectedRevision));
    startTransition(() => planAction(formData));
  };

  return (
    <>
      {back}
      <p
        className={quiet ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
      {showReload ? (
        <a
          className={styles.reload}
          href={sessionHref(
            session.id,
            origin === "today"
              ? { from: "today", date: originDate ?? session.localDate }
              : past
                ? { date: session.localDate }
                : null,
          )}
        >
          Reload this session
        </a>
      ) : null}
      {state.status === "session" && !showSeries ? (
        <Link className={styles.reload} href="/">
          Sign in again
        </Link>
      ) : null}

      <article
        className={page.card}
        data-locked={session.isLocked}
        data-cancelled={cancelled}
        aria-labelledby="session-title"
      >
        <h1 id="session-title" className={page.title}>
          {session.title}
        </h1>
        {/* When, what and how long as one quiet line under the title (owner,
            1 Oct 2026), rather than a coloured line above it. */}
        <p className={page.when}>
          {[
            stampDate(session.localDate),
            session.localDate === today ? "Today" : null,
            session.sport,
            session.expectedDurationMinutes === null
              ? null
              : `${session.expectedDurationMinutes} min`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className={page.marks}>
          {session.seriesId === null ? null : <span>Recurring</span>}
          {session.hasDiverged ? (
            <span data-mark="changed">Changed</span>
          ) : null}
          {session.isLocked ? <span data-mark="locked">Locked</span> : null}
          {cancelled ? <span>Cancelled</span> : null}
          {session.log ? (
            <span data-mark="logged" data-outcome={session.log.outcome}>
              {COMPLETION_OUTCOME_LABELS[session.log.outcome]}
              {session.log.actualLocalDate === session.localDate
                ? ""
                : ` on ${stampDate(session.log.actualLocalDate)}`}
            </span>
          ) : null}
        </div>
        {session.intent === null ? null : (
          <p className={page.text}>{session.intent}</p>
        )}
        {session.note === null ? null : (
          <p className={page.text}>{session.note}</p>
        )}
        <ActivityList
          label="Activities"
          items={session.activities.map((activity, index) => ({
            key: String(index),
            name: activity.name,
            detail: describeMeasurement(activity.target),
          }))}
        />
        {cancelled && cancellation !== null ? (
          <p className={page.reason} data-cancellation-reason>
            <span className={page.reasonLabel}>Why</span> “{cancellation.reason}
            ”
          </p>
        ) : null}
        {cancelled && !past ? (
          <p className={page.aside}>
            Cancelled, kept on the record. Reactivate puts it back after the
            day&rsquo;s last session
            {cancellation === null ? "." : " and clears the reason."}
          </p>
        ) : null}
        {past && !session.log ? (
          <p className={page.aside}>
            This day has passed, so the plan can no longer change it. You can
            still log what happened.
          </p>
        ) : null}

        <div className={page.actions} data-session-actions>
          {plannable ? (
            <button
              className={page.main}
              type="button"
              aria-expanded={panel === "edit"}
              onClick={() => setPanel(panel === "edit" ? null : "edit")}
              disabled={busy}
            >
              Edit
            </button>
          ) : cancelled && !past ? (
            <button
              className={page.main}
              type="button"
              onClick={() => submit({ operation: "reactivate" })}
              disabled={busy}
            >
              Reactivate
            </button>
          ) : (
            <Link className={page.main} href={logHref}>
              {session.log ? "Edit log" : "Log this session"}
            </Link>
          )}

          {plannable ? (
            <MoreMenu>
              {(close) => (
                <>
                  <MenuLink href={logHref}>Log this session</MenuLink>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setPanel("duplicate");
                    }}
                  >
                    Duplicate
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setPanel("save");
                    }}
                  >
                    Save to library
                  </MenuItem>
                  <MenuItem
                    disabled={busy}
                    onSelect={() => {
                      close();
                      submit({
                        operation: "set_lock",
                        isLocked: session.isLocked ? "false" : "true",
                      });
                    }}
                  >
                    {session.isLocked ? "Unlock" : "Lock"}
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setPanel("cancel");
                    }}
                  >
                    Cancel session
                  </MenuItem>
                  <MenuItem
                    danger
                    onSelect={() => {
                      close();
                      setPanel("delete");
                    }}
                  >
                    Delete
                  </MenuItem>
                </>
              )}
            </MoreMenu>
          ) : session.log ? (
            // What a Progress record offers (owner, 3 Oct 2026): training that
            // happened can be saved to the library; a skip or a replacement
            // records none, so it offers nothing. Nothing here changes the
            // session itself.
            recordsTraining(session.log.outcome) ? (
              <MoreMenu>
                {(close) => (
                  <MenuItem
                    onSelect={() => {
                      close();
                      setPanel("save");
                    }}
                  >
                    Save to library
                  </MenuItem>
                )}
              </MoreMenu>
            ) : null
          ) : cancelled ? (
            <MoreMenu>
              {(close) => (
                <>
                  <MenuItem
                    onSelect={() => {
                      close();
                      setPanel("reason");
                    }}
                  >
                    {cancellation === null ? "Add reason" : "Edit reason"}
                  </MenuItem>
                  {past ? null : (
                    <MenuItem
                      danger
                      onSelect={() => {
                        close();
                        setPanel("delete");
                      }}
                    >
                      Delete
                    </MenuItem>
                  )}
                </>
              )}
            </MoreMenu>
          ) : null}
        </div>
      </article>

      {panel === null ? null : (
        <ActionPanel
          heading={PANEL_HEADINGS[panel]}
          onClose={() => setPanel(null)}
        >
          {panel === "edit" ? (
            recurring === null ? (
              <form
                className={styles.form}
                action={planAction}
                key={`edit-${state.submission}`}
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
                    state.operation === "edit" && state.draft
                      ? state.draft
                      : draftOf(session)
                  }
                  activities={session.activities}
                  fill={{ sessionId: session.id, open: session.openFill }}
                  dateField={
                    <div className={styles.field}>
                      <label htmlFor={`edit-date-${session.id}`}>Date</label>
                      <PlanDateInput
                        id={`edit-date-${session.id}`}
                        range={dateRange}
                        defaultValue={session.localDate}
                      />
                    </div>
                  }
                />
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={busy}
                >
                  Save session
                </button>
              </form>
            ) : (
              <RecurringSessionControls
                mode="edit"
                today={today}
                session={recurringView}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={planAction}
                planPending={pending}
                seriesAction={trackedSeriesAction}
                seriesPending={seriesPending}
              />
            )
          ) : null}

          {panel === "duplicate" ? (
            <form className={styles.form} action={planAction}>
              <input type="hidden" name="operation" value="duplicate" />
              <input type="hidden" name="sessionId" value={session.id} />
              <input
                type="hidden"
                name="expectedRevision"
                value={expectedRevision}
              />
              <div className={styles.field}>
                <label htmlFor={`duplicate-${session.id}`}>Copy to</label>
                <PlanDateInput
                  id={`duplicate-${session.id}`}
                  range={dateRange}
                  defaultValue={session.localDate}
                />
              </div>
              <p className={styles.consequenceStandalone}>
                The copy is a new session. It starts unlocked and carries none
                of this session&rsquo;s history.
              </p>
              <button className={styles.primary} type="submit" disabled={busy}>
                Duplicate session
              </button>
            </form>
          ) : null}

          {panel === "reason" ? (
            <ReasonForm
              sessionId={session.id}
              initial={cancellation}
              onSaved={closePanel}
            />
          ) : null}

          {panel === "save" ? (
            <SaveToLibrary bare sessionId={session.id} />
          ) : null}

          {panel === "cancel" ? (
            recurring === null ? (
              <form className={styles.form} action={planAction}>
                <p className={styles.consequenceStandalone}>
                  Cancelling keeps the session on the record as cancelled. It
                  stops being part of what you plan to do, and you can still
                  reactivate or delete it afterwards.
                </p>
                <input type="hidden" name="operation" value="cancel" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedRevision}
                />
                <CancelReasonFields idPrefix={`cancel-${session.id}`} />
                <button className={styles.action} type="submit" disabled={busy}>
                  Cancel session
                </button>
              </form>
            ) : (
              <RecurringSessionControls
                mode="remove"
                today={today}
                session={recurringView}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={planAction}
                planPending={pending}
                seriesAction={trackedSeriesAction}
                seriesPending={seriesPending}
              />
            )
          ) : null}

          {panel === "delete" ? (
            recurring === null ? (
              <form className={styles.form} action={planAction}>
                <p className={styles.permanentConsequence}>
                  {ONE_OFF_WARNING} A session you have logged training against
                  cannot be deleted.
                </p>
                <input type="hidden" name="operation" value="delete" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedRevision}
                />
                <button
                  className={styles.dangerAction}
                  type="submit"
                  disabled={busy}
                >
                  Delete session
                </button>
              </form>
            ) : (
              <RecurringDeleteControls
                today={today}
                sessionId={session.id}
                occurrenceDate={recurring.occurrenceDate}
                series={recurring.series}
                expectedRevision={expectedRevision}
                planAction={planAction}
                planPending={pending}
                seriesAction={trackedSeriesAction}
                seriesState={seriesState}
                seriesPending={seriesPending}
              />
            )
          ) : null}
        </ActionPanel>
      )}
    </>
  );
}

export type SessionCancellationView = { reason: string };

/**
 * Adds, edits or clears why the session was cancelled. It has its own action
 * because a reason annotates the plan without changing it: no revision is
 * checked, and nothing else on the page is disturbed by saving one.
 */
function ReasonForm({
  sessionId,
  initial,
  onSaved,
}: {
  sessionId: string;
  initial: SessionCancellationView | null;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(
    setCancellationReasonAction,
    INITIAL_CANCELLATION_ACTION_STATE,
  );
  // Closing the panel belongs to the page, so it happens after this form's
  // render rather than during it.
  useEffect(() => {
    if (state.status === "saved") onSaved();
  }, [state.status, state.submission, onSaved]);

  return (
    <form className={styles.form} action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <CancelReasonFields
        idPrefix={`reason-${sessionId}`}
        initial={initial?.reason ?? null}
      />
      <p className={styles.consequenceStandalone}>
        Only you see this. It is kept with the session and is not sent to a
        coach.
      </p>
      <button className={styles.primary} type="submit" disabled={pending}>
        Save reason
      </button>
      {initial === null ? null : (
        <button
          className={styles.action}
          type="submit"
          disabled={pending}
          formAction={(formData: FormData) => {
            formData.set("cancelReason", "");
            action(formData);
          }}
        >
          Clear reason
        </button>
      )}
      <p
        className={
          state.status === "idle" ? styles.srOnly : styles.noticeInline
        }
        data-state={pending ? "saving" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving the reason…" : state.message}
      </p>
    </form>
  );
}

/**
 * The panel a verb opens below the session. Its heading takes focus when it
 * opens, so a screen reader and a keyboard both land where the choice is.
 */
function ActionPanel({
  heading,
  onClose,
  children,
}: {
  heading: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    headingRef.current?.focus();
  }, [heading]);

  return (
    <section
      className={page.panel}
      aria-labelledby={headingId}
      data-session-panel={heading}
    >
      <div className={page.panelHead}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {heading}
        </h2>
        <button className={page.close} type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </section>
  );
}

/**
 * ⋯: a disclosure button and the list it shows. It is not an ARIA `menu`,
 * whose arrow-key contract a plain list of buttons would only half keep; a
 * disclosure promises exactly what this does. Escape and a tap elsewhere
 * close it.
 */
function MoreMenu({
  children,
}: {
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const buttonId = useId();
  // Choosing an item unmounts the list under the focus, so it goes back to
  // the button that opened it rather than falling to the page. Found by id
  // because this runs from an item's handler, handed down during render.
  const close = useCallback(() => {
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  }, [buttonId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={page.menu} ref={root}>
      <button
        ref={button}
        id={buttonId}
        className={page.more}
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open ? (
        <ul className={page.menuList} id={listId}>
          {children(close)}
        </ul>
      ) : null}
    </div>
  );
}

function MenuItem({
  onSelect,
  danger = false,
  disabled = false,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        className={page.menuItem}
        data-danger={danger || undefined}
        type="button"
        onClick={onSelect}
        disabled={disabled}
      >
        {children}
      </button>
    </li>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link className={page.menuItem} href={href}>
        {children}
      </Link>
    </li>
  );
}
