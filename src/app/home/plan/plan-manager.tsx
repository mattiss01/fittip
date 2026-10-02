"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionState,
} from "./action-state";
import { changePlanAction } from "./actions";
import { COMPLETION_OUTCOME_LABELS } from "../log/log-action-state";
import { CreateSession, SkippedDates } from "./create-session";
import styles from "./plan.module.css";
import w from "./plan-week.module.css";
import {
  RECOVERED_NOTICE,
  SERIES_RECOVERY_FLAG,
  stallNotice,
  useMutationStall,
  useRecoveredReload,
} from "./plan-mutation-watch";
import {
  INITIAL_SERIES_ACTION_STATE,
  type SeriesActionState,
} from "./series-action-state";
import { changeSeriesAction } from "./series-actions";
import { SeriesMaterializer } from "./series-materializer";
import {
  dayLabel,
  dayLoad,
  formatPlannedTime,
  phaseOfWeek,
  planWeeks,
  shortDateLabel,
  sportKey,
  sportTones,
  weekdayLabel,
  weekIndexOf,
  type PlanPhase,
  type PlanWeek,
  type PlanWeekDay,
} from "./plan-weeks";
import {
  readsAsLogged,
  sessionHref,
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
  /** The last date a session may be placed on; nothing past it is read. */
  lastDate: string;
  /** The last date recurring sessions are written through. */
  repeatsThrough?: string;
  /** The day to open on, e.g. the one a session page returns to. */
  initialDate?: string | null;
  expectedRevision: number;
  sessions: PlanSessionView[];
  recoveryDates: string[];
  /** What a day's sheet may start a session from. */
  savedSessions?: SavedSessionOption[];
  uncoveredSeriesDates?: string[];
  /** The accepted roadmap's phases, if there is one. */
  phases?: PlanPhase[];
};

type ActionChannel = "plan" | "series";

type Sheet =
  | { date: string; view: "menu" | "library" }
  | { date: string; view: "new"; startFrom?: SavedSessionOption };

export function PlanManager({
  today,
  lastDate,
  repeatsThrough = lastDate,
  initialDate = null,
  expectedRevision,
  sessions,
  recoveryDates,
  savedSessions = [],
  uncoveredSeriesDates = [],
  phases = [],
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

  const weeks = planWeeks(today, lastDate, repeatsThrough);
  const [weekIndex, setWeekIndex] = useState(() =>
    weekIndexOf(weeks, initialDate),
  );
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const [sheet, setSheet] = useSheetClosedOnSave(state, seriesState);
  // The plan submission the open sheet started after, so a refusal shown in
  // it is one of its own and not one from before it opened.
  const [sheetSince, setSheetSince] = useState(state.submission);
  const recoveryRefusal =
    state.operation === "set_recovery_day" &&
    state.status !== "saved" &&
    state.status !== "idle" &&
    state.submission > sheetSince
      ? state.message
      : null;
  const labelled = new Set(recoveryDates);
  const tones = sportTones(sessions.map((session) => session.sport));
  const onDate = (date: string) =>
    sessions.filter((session) => session.localDate === date);

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

      <SkippedDates
        skipped={
          seriesState.operation === "add_series"
            ? (seriesState.skipped ?? [])
            : []
        }
      />

      <PhaseBand phase={phaseOfWeek(phases, week)} />

      <section
        className={w.week}
        aria-labelledby="plan-week-title"
        data-plan-week={week.start}
      >
        <header className={w.weekHead}>
          <WeekArrow
            label="Previous week"
            glyph="‹"
            target={weekIndex > 0 ? weekIndex - 1 : null}
            onGo={setWeekIndex}
          />
          <div className={w.weekTitle}>
            <h2 id="plan-week-title">{weekLabel(week, weekIndex)}</h2>
            {weekIndex < 2 ? (
              <p className={w.weekSum}>{weekRange(week)}</p>
            ) : null}
            <p className={w.weekSum}>{weekTotals(week, sessions)}</p>
            {/* Otherwise a daily run simply stops after week 13 and nothing
                says why. */}
            {week.days.some((day) => day.afterRepeats && !day.beyond) ? (
              <p className={w.weekSum} data-plan-repeats-through>
                Repeats are added through {shortDateLabel(repeatsThrough)}
              </p>
            ) : null}
          </div>
          <WeekArrow
            label="Next week"
            glyph="›"
            target={weekIndex < weeks.length - 1 ? weekIndex + 1 : null}
            onGo={setWeekIndex}
          />
        </header>
        <ol className={w.days}>
          {week.days.map((day) => (
            <PlanDay
              key={day.date}
              day={day}
              today={today}
              isRecoveryDay={labelled.has(day.date)}
              sessions={onDate(day.date)}
              tones={tones}
              onAdd={() => {
                setSheetSince(state.submission);
                setSheet({ date: day.date, view: "menu" });
              }}
            />
          ))}
        </ol>
      </section>

      <nav className={w.tiles} aria-label="Weeks">
        {weeks.map((candidate, index) => (
          <button
            key={candidate.start}
            type="button"
            className={w.tile}
            aria-current={index === weekIndex ? "true" : undefined}
            aria-label={`Week of ${dayLabel(candidate.start)}, ${formatPlannedTime(
              plannedMinutes(candidate, sessions),
            )} planned`}
            data-week-start={candidate.start}
            onClick={() => setWeekIndex(index)}
          >
            <span className={w.tileLabel}>
              {index === 0 ? "This wk" : shortDateLabel(candidate.start)}
            </span>
            <span className={w.tileBars} aria-hidden="true">
              {candidate.days.map((day) => (
                <span
                  key={day.date}
                  data-load={dayLoad(
                    activeOn(onDate(day.date)).map(
                      (session) => session.expectedDurationMinutes,
                    ),
                  )}
                />
              ))}
            </span>
            <span className={w.tileSum}>
              {formatPlannedTime(plannedMinutes(candidate, sessions))}
            </span>
          </button>
        ))}
      </nav>

      {sheet === null ? null : (
        <DaySheet
          sheet={sheet}
          isRecoveryDay={labelled.has(sheet.date)}
          savedSessions={savedSessions}
          onChange={setSheet}
          onClose={() => setSheet(null)}
        >
          {sheet.view === "new" ? (
            <CreateSession
              key={`${sheet.date}-${sheet.startFrom?.id ?? "empty"}`}
              date={sheet.date}
              canRepeat={sheet.date <= repeatsThrough}
              startFrom={sheet.startFrom}
              expectedRevision={expectedRevision}
              planAction={trackedPlanAction}
              planState={state}
              planPending={pending}
              seriesAction={trackedSeriesAction}
              seriesState={seriesState}
              seriesPending={seriesPending}
            />
          ) : sheet.view === "menu" ? (
            <form action={trackedPlanAction}>
              {recoveryRefusal === null ? null : (
                <p className={w.sheetError} role="alert">
                  {recoveryRefusal}
                </p>
              )}
              <input type="hidden" name="operation" value="set_recovery_day" />
              <input type="hidden" name="localDate" value={sheet.date} />
              <input
                type="hidden"
                name="isRecoveryDay"
                value={labelled.has(sheet.date) ? "false" : "true"}
              />
              <input
                type="hidden"
                name="expectedRevision"
                value={expectedRevision}
              />
              <button
                className={w.sheetChoice}
                type="submit"
                disabled={pending}
              >
                {labelled.has(sheet.date)
                  ? "Remove recovery day"
                  : "Mark as recovery day"}
              </button>
            </form>
          ) : null}
        </DaySheet>
      )}
    </div>
  );
}

/**
 * The sheet closes on a save that created something or set the recovery
 * label, so the owner lands on the week showing it; a refused save leaves
 * it open over what needs fixing.
 */
function useSheetClosedOnSave(
  planState: PlanActionState,
  seriesState: SeriesActionState,
) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const saved = `${
    planState.operation === "add" && planState.status === "saved"
      ? planState.submission
      : ""
  }/${
    seriesState.operation === "add_series" && seriesState.status === "saved"
      ? seriesState.submission
      : ""
  }`;
  // A recovery label is set from the sheet's menu, so only a menu closes on
  // it: a label landing late never takes a half-typed session with it.
  const labelSaved =
    planState.operation === "set_recovery_day" && planState.status === "saved"
      ? planState.submission
      : null;
  const [seenSave, setSeenSave] = useState(saved);
  const [seenLabel, setSeenLabel] = useState(labelSaved);
  if (saved !== seenSave) {
    setSeenSave(saved);
    if (saved !== "/") setSheet(null);
  }
  if (labelSaved !== seenLabel) {
    setSeenLabel(labelSaved);
    if (labelSaved !== null && sheet?.view === "menu") setSheet(null);
  }
  return [sheet, setSheet] as const;
}

function WeekArrow({
  label,
  glyph,
  target,
  onGo,
}: {
  label: string;
  glyph: string;
  target: number | null;
  onGo: (index: number) => void;
}) {
  if (target === null) return <span className={w.arrow} aria-hidden="true" />;
  return (
    <button
      type="button"
      className={w.arrow}
      aria-label={label}
      onClick={() => onGo(target)}
    >
      {glyph}
    </button>
  );
}

function PhaseBand({ phase }: { phase: PlanPhase | null }) {
  if (phase === null) return null;
  return (
    <Link className={w.phase} href="/home/plan/roadmap" data-plan-phase>
      <span className={w.phaseName}>{phase.title}</span>
      <span className={w.phaseFocus}>{phase.focus}</span>
    </Link>
  );
}

function PlanDay({
  day,
  today,
  isRecoveryDay,
  sessions,
  tones,
  onAdd,
}: {
  day: PlanWeekDay;
  today: string;
  isRecoveryDay: boolean;
  sessions: PlanSessionView[];
  tones: Map<string, number>;
  onAdd: () => void;
}) {
  const shown = sessions
    .filter((session) => session.status === "active" || session.log)
    .toSorted((left, right) => left.position - right.position);
  const cancelled = sessions.filter(
    (session) => session.status === "cancelled" && !session.log,
  );
  const headingId = `plan-day-${day.date}`;
  const empty = shown.length === 0 && cancelled.length === 0;

  return (
    <li
      className={w.day}
      id={headingId}
      data-plan-date={day.date}
      data-today={day.date === today}
      data-past={day.past}
      data-beyond={day.beyond}
      data-recovery={isRecoveryDay}
    >
      <p className={w.date}>
        <span className={w.dow}>{weekdayLabel(day.date)}</span>
        <span className={w.num}>{Number(day.date.slice(8))}</span>
        <span className={styles.srOnly}>{dayLabel(day.date)}</span>
        {isRecoveryDay ? (
          <span className={w.recoveryMark} title="Recovery day">
            <span aria-hidden="true">☾</span>
            {/* An empty recovery day already says so in its body. */}
            {empty ? null : <span className={styles.srOnly}>Recovery day</span>}
          </span>
        ) : null}
      </p>
      <div className={w.dayBody}>
        {empty && day.past ? null : empty ? (
          <p className={w.empty}>
            {day.beyond ? "Not open yet" : isRecoveryDay ? "Recovery day" : "—"}
          </p>
        ) : (
          <ol className={w.sessionList} aria-label={dayLabel(day.date)}>
            {shown.map((session) => (
              <PlanSessionCard
                key={session.id}
                session={session}
                past={day.past}
                tone={tones.get(sportKey(session.sport)) ?? 0}
              />
            ))}
            {cancelled.map((session) => (
              <PlanSessionCard
                key={session.id}
                session={session}
                past={day.past}
                tone={tones.get(sportKey(session.sport)) ?? 0}
              />
            ))}
          </ol>
        )}
      </div>
      {day.past || day.beyond ? null : (
        <button
          type="button"
          className={w.add}
          aria-label={`Add to ${dayLabel(day.date)}`}
          onClick={onAdd}
        >
          +
        </button>
      )}
    </li>
  );
}

/**
 * A card reads the session and opens it (owner, 29 Sep 2026): every verb —
 * Edit, Cancel, Delete, Lock, Duplicate, Save to library — lives on the
 * session's own page. R3a made it compact: title, a ↻ for a series, the
 * planned minutes, and a stripe in the sport's tone. The title is the link,
 * stretched over the whole card.
 */
function PlanSessionCard({
  session,
  past,
  tone,
}: {
  session: PlanSessionView;
  /** Before today: the session's page finds it by its day, not the window. */
  past: boolean;
  tone: number;
}) {
  const loggedElsewhere = readsAsLogged(session);
  const cancelled = session.status === "cancelled" && !session.log;
  return (
    <li
      className={w.card}
      data-tone={tone}
      data-locked={session.isLocked}
      data-cancelled={cancelled || undefined}
      data-logged={loggedElsewhere || undefined}
      data-session-card={cancelled || loggedElsewhere ? undefined : true}
    >
      <h3 className={w.cardTitle}>
        <Link
          className={w.cardLink}
          href={sessionHref(
            session.id,
            past ? { date: session.localDate } : null,
          )}
        >
          {session.title}
        </Link>
      </h3>
      <span className={w.cardMeta}>
        {session.seriesId === null ? null : (
          <span className={w.loop} title="Repeats">
            <span aria-hidden="true">↻</span>
            <span className={styles.srOnly}>Recurring</span>
          </span>
        )}
        {cardDetail(session, cancelled)}
      </span>
    </li>
  );
}

function cardDetail(session: PlanSessionView, cancelled: boolean): string {
  if (cancelled) return "Cancelled";
  if (session.log) {
    const outcome = COMPLETION_OUTCOME_LABELS[session.log.outcome];
    return session.log.actualLocalDate === session.localDate
      ? outcome
      : `${outcome} on ${dayLabel(session.log.actualLocalDate)}`;
  }
  return [
    session.expectedDurationMinutes === null
      ? null
      : `${session.expectedDurationMinutes} min`,
    session.isLocked ? "Locked" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DaySheet({
  sheet,
  isRecoveryDay,
  savedSessions,
  onChange,
  onClose,
  children,
}: {
  sheet: Sheet;
  isRecoveryDay: boolean;
  savedSessions: SavedSessionOption[];
  onChange: (sheet: Sheet) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  // Read while rendering, before the title below takes focus.
  const [opener] = useState(() => document.activeElement);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [sheet.view]);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const layerRef = useRef<HTMLDivElement>(null);
  // Modal while open: everything else on the page is inert, so Tab stays in
  // the sheet, and the page behind does not scroll. Escape closes; focus
  // goes back to the "+" that opened the sheet.
  useEffect(() => {
    const layer = layerRef.current;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== layer && !element.inert,
    );
    for (const element of background) element.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const element of background) element.inert = false;
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  // Portalled to the body so it sits above the bottom navigation, whatever
  // stacking context the page's main element makes.
  return createPortal(
    <div className={w.sheetLayer} ref={layerRef}>
      <button
        type="button"
        className={w.scrim}
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className={w.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-sheet-title"
        data-plan-sheet={sheet.view}
      >
        <header className={w.sheetHead}>
          {sheet.view === "menu" ? (
            <span />
          ) : (
            <button
              type="button"
              className={w.sheetBack}
              onClick={() => onChange({ date: sheet.date, view: "menu" })}
            >
              ‹ Back
            </button>
          )}
          <button type="button" className={w.sheetClose} onClick={onClose}>
            Close
          </button>
        </header>
        <h2 id="plan-sheet-title" ref={titleRef} tabIndex={-1}>
          {sheet.view === "library"
            ? "Use session from library"
            : sheet.view === "new"
              ? "New session"
              : dayLabel(sheet.date)}
        </h2>
        {sheet.view === "menu" ? null : (
          <p className={w.sheetDate}>
            {dayLabel(sheet.date)}
            {isRecoveryDay ? " · Recovery day" : null}
          </p>
        )}
        {sheet.view === "menu" ? (
          <div className={w.sheetChoices}>
            <button
              type="button"
              className={w.sheetChoice}
              onClick={() => onChange({ date: sheet.date, view: "new" })}
            >
              New session
            </button>
            {savedSessions.length === 0 ? null : (
              <button
                type="button"
                className={w.sheetChoice}
                onClick={() => onChange({ date: sheet.date, view: "library" })}
              >
                Use session from library
              </button>
            )}
            {children}
          </div>
        ) : sheet.view === "library" ? (
          <ul className={w.sheetList} aria-label="Saved sessions">
            {savedSessions.map((saved) => (
              <li key={saved.id}>
                <button
                  type="button"
                  className={w.sheetChoice}
                  onClick={() =>
                    onChange({
                      date: sheet.date,
                      view: "new",
                      startFrom: saved,
                    })
                  }
                >
                  <span>{saved.name}</span>
                  <span className={w.sheetChoiceDetail}>
                    {[
                      saved.sport,
                      saved.expectedDurationMinutes === null
                        ? null
                        : `${saved.expectedDurationMinutes} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}

function activeOn(sessions: PlanSessionView[]) {
  return sessions.filter((session) => session.status === "active");
}

function plannedMinutes(week: PlanWeek, sessions: PlanSessionView[]) {
  return activeOn(
    sessions.filter(
      (session) =>
        session.localDate >= week.start && session.localDate <= week.end,
    ),
  ).reduce((sum, session) => sum + (session.expectedDurationMinutes ?? 0), 0);
}

/** Week totals say "planned", never done. */
function weekTotals(week: PlanWeek, sessions: PlanSessionView[]) {
  const count = activeOn(
    sessions.filter(
      (session) =>
        session.localDate >= week.start && session.localDate <= week.end,
    ),
  ).length;
  if (count === 0) return "Nothing planned";
  return `${count} ${count === 1 ? "session" : "sessions"} · ${formatPlannedTime(
    plannedMinutes(week, sessions),
  )} planned`;
}

function weekLabel(week: PlanWeek, index: number) {
  if (index === 0) return "This week";
  if (index === 1) return "Next week";
  return weekRange(week);
}

function weekRange(week: PlanWeek) {
  return `${shortDateLabel(week.start)} – ${shortDateLabel(week.end)}`;
}
