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
import { changePlanAction } from "../../actions";
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
  readsAsLogged,
  sessionHref,
  stampDate,
  type PlanSessionView,
} from "../../session-view";

import { COMPLETION_OUTCOME_LABELS } from "../../../log/log-action-state";
import { ActivityList } from "@/components/training/activity-list";
import { describeMeasurement } from "@/lib/training/describe-measurement";

export type SessionPageOrigin = "plan" | "today";

type Panel = "edit" | "duplicate" | "save" | "cancel" | "delete";
type Channel = "plan" | "series";

const PANEL_HEADINGS: Record<Panel, string> = {
  edit: "Edit session",
  duplicate: "Duplicate",
  save: "Save to library",
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
  dates,
  expectedRevision,
  origin,
  originDate,
}: {
  session: PlanSessionView | null;
  series?: PlanSeriesView;
  today: string;
  dates: string[];
  expectedRevision: number;
  origin: SessionPageOrigin;
  originDate: string | null;
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
    <Link className={styles.backLink} href={returnHref} data-back-link>
      <span aria-hidden="true">&larr;</span>{" "}
      {origin === "today" ? "Today" : "Plan"}
    </Link>
  );

  if (session === null) {
    return (
      <>
        {back}
        <section
          className={styles.missingCard}
          data-session-state={gone ? "removed" : "missing"}
          aria-live="polite"
        >
          {gone ? (
            <>
              <h1>
                {replacedBySeriesEdit ? "Change saved." : "Session removed."}
              </h1>
              <p>Taking you back to {returnLabel}.</p>
            </>
          ) : (
            <>
              <h1>That session is not there.</h1>
              <p>
                It may have been deleted, or it is not one of yours. Nothing was
                changed.
              </p>
              <Link className={styles.primary} href={returnHref}>
                Back to {returnLabel}
              </Link>
            </>
          )}
        </section>
      </>
    );
  }

  const logged = readsAsLogged(session);
  const past = session.localDate < today;
  const cancelled = session.status === "cancelled" && !logged;
  const plannable = !past && !logged && !cancelled;
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
        className={styles.sessionSheet}
        data-locked={session.isLocked}
        data-cancelled={cancelled}
        aria-labelledby="session-title"
      >
        <p className={styles.sheetDate}>
          {stampDate(session.localDate)}
          {session.localDate === today ? " · Today" : ""}
        </p>
        <h1 id="session-title" className={styles.sheetTitle}>
          {session.title}
        </h1>
        <div className={styles.sheetMarks}>
          {session.seriesId === null ? null : (
            <span className={styles.seriesMark}>Recurring</span>
          )}
          {session.hasDiverged ? (
            <span className={styles.changedMark}>Changed</span>
          ) : null}
          {session.isLocked ? (
            <span className={styles.lockMark}>Locked</span>
          ) : null}
          {cancelled ? (
            <span className={styles.changedMark}>Cancelled</span>
          ) : null}
          {session.log ? (
            <span className={styles.seriesMark}>
              {COMPLETION_OUTCOME_LABELS[session.log.outcome]}
              {session.log.actualLocalDate === session.localDate
                ? ""
                : ` on ${stampDate(session.log.actualLocalDate)}`}
            </span>
          ) : null}
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
        {cancelled ? (
          <p className={styles.consequenceStandalone}>
            Cancelled, kept on the record. Reactivate puts it back after the
            day&rsquo;s last session.
          </p>
        ) : null}
        {past && !session.log ? (
          <p className={styles.consequenceStandalone}>
            This day has passed, so the plan can no longer change it. You can
            still log what happened.
          </p>
        ) : null}

        <div className={styles.sheetActions} data-session-actions>
          {plannable ? (
            <button
              className={styles.primary}
              type="button"
              aria-expanded={panel === "edit"}
              onClick={() => setPanel(panel === "edit" ? null : "edit")}
              disabled={busy}
            >
              Edit
            </button>
          ) : cancelled && !past ? (
            <button
              className={styles.primary}
              type="button"
              onClick={() => submit({ operation: "reactivate" })}
              disabled={busy}
            >
              Reactivate
            </button>
          ) : (
            <Link className={styles.primary} href={logHref}>
              {session.log ? "Edit log" : "Log this session"}
            </Link>
          )}

          {plannable ? (
            <MoreMenu>
              {(close) => (
                <>
                  <MenuLink href={logHref}>
                    {session.log ? "Edit log" : "Log this session"}
                  </MenuLink>
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
          ) : cancelled && !past ? (
            <MoreMenu>
              {(close) => (
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
                      <select
                        id={`edit-date-${session.id}`}
                        name="localDate"
                        defaultValue={session.localDate}
                      >
                        {[
                          session.localDate,
                          ...dates.filter((date) => date !== session.localDate),
                        ]
                          .sort()
                          .map((date) => (
                            <option key={date} value={date}>
                              {stampDate(date)}
                            </option>
                          ))}
                      </select>
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
              <p className={styles.consequenceStandalone}>
                The copy is a new session. It starts unlocked and carries none
                of this session&rsquo;s history.
              </p>
              <button className={styles.primary} type="submit" disabled={busy}>
                Duplicate session
              </button>
            </form>
          ) : null}

          {panel === "save" ? (
            <SaveToLibrary
              bare
              sessionId={session.id}
              defaultName={session.title}
            />
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
                  cannot be deleted; cancel it instead.
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
      className={styles.actionPanel}
      aria-labelledby={headingId}
      data-session-panel={heading}
    >
      <div className={styles.actionPanelHeader}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {heading}
        </h2>
        <button className={styles.action} type="button" onClick={onClose}>
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
    <div className={styles.moreMenu} ref={root}>
      <button
        ref={button}
        id={buttonId}
        className={styles.moreButton}
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">&#x22EF;</span>
      </button>
      {open ? (
        <ul className={styles.moreList} id={listId}>
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
        className={styles.moreItem}
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
      <Link className={styles.moreItem} href={href}>
        {children}
      </Link>
    </li>
  );
}
