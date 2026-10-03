"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionState,
} from "./action-state";
import { changePlanAction } from "./actions";
import { COMPLETION_OUTCOME_LABELS } from "../log/log-action-state";
import { CreateSession, SkippedDates } from "./create-session";
import { MonthSheet } from "./plan-month-sheet";
import { markSlide, Slide } from "@/components/motion/slide";
import { SheetCloseButton, SheetLayer } from "./plan-sheet";
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
  /** A date in the earliest week to show; this week when there is none. */
  firstDate?: string;
  /** The last date a session may be placed on; nothing past it is read. */
  lastPlaceableDate: string;
  /** The last date recurring sessions are written through. */
  repeatsThrough: string;
  /** Whether the owner has a series at all, so a week can say where it stops. */
  hasRepeats?: boolean;
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
  firstDate = today,
  lastPlaceableDate,
  repeatsThrough,
  hasRepeats = false,
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

  const weeks = planWeeks(today, lastPlaceableDate, repeatsThrough, firstDate);
  // The weeks before this one sit ahead of it in the list (owner, 2 Oct
  // 2026), so "this week" is no longer the first: the Plan opens on it, and
  // a week is named by how far it is from it.
  const thisWeekIndex = weekIndexOf(weeks, today);
  const [weekIndex, setWeekIndex] = useState(() =>
    weekIndexOf(weeks, initialDate, thisWeekIndex),
  );
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const weekOffset = weekIndex - thisWeekIndex;
  // R4 (owner, 3 Oct 2026): the week's days slide in from the side they come
  // from. The change is a transition tagged with its direction, which the
  // <ViewTransition> round the days reads; reduced motion is the CSS's.
  const goToWeek = useCallback(
    (index: number) => {
      if (index === weekIndex) return;
      startTransition(() => {
        markSlide(index > weekIndex ? "slide-forward" : "slide-back");
        setWeekIndex(index);
      });
    },
    [weekIndex],
  );
  // Some forty weeks of tiles scroll sideways, so the one being shown is
  // brought into view: the strip otherwise opens on its oldest week with
  // nothing marked. Instant, so there is no motion to reduce.
  //
  // Where it lands looks ahead (owner, 2 Oct 2026). A coming week goes to the
  // middle, but never so far that a past week shows beside it: this week at
  // the left edge is as far back as the strip goes on its own. This week and
  // a past week go to the left edge themselves. The past is a scroll away.
  //
  // Only the strip moves. `scrollIntoView` also scrolls the page until the
  // tile is on screen, and the strip sits below the week, so a tap on a week
  // arrow threw the owner to the bottom of the page (owner, 2 Oct 2026).
  const tilesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = tilesRef.current;
    const tiles = strip?.children;
    const current = tiles?.[weekIndex];
    if (!strip || !tiles || !current) return;
    const stripBox = strip.getBoundingClientRect();
    const tileBox = current.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(strip).paddingLeft) || 0;
    // The strip snaps to whole tiles, so "the middle" is counted in tiles:
    // how many fit to the left of one that sits in the middle. Scrolling to
    // a pixel centre instead is re-snapped by the browser, to one side or the
    // other depending on a few pixels of width.
    const pitch =
      tiles.length > 1
        ? tiles[1].getBoundingClientRect().left -
          tiles[0].getBoundingClientRect().left
        : 0;
    const before =
      pitch > 0 ? Math.round((stripBox.width - tileBox.width) / 2 / pitch) : 0;
    const leftmost =
      weekIndex > thisWeekIndex
        ? tiles[Math.max(thisWeekIndex, weekIndex - before)]
        : current;
    strip.scrollLeft +=
      leftmost.getBoundingClientRect().left - stripBox.left - inset;
  }, [weekIndex, thisWeekIndex]);
  const [sheet, setSheet] = useSheetClosedOnSave(state, seriesState);
  const [monthOpen, setMonthOpen] = useState(false);
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
            onGo={goToWeek}
          />
          <div className={w.weekTitle}>
            {/* The title is the way to the month calendar: the button's hit
                area is stretched over the whole row, so the heading stays a
                heading and a tap on it still opens the sheet. */}
            <div className={w.weekTitleRow}>
              <h2 id="plan-week-title">{weekLabel(week, weekOffset)}</h2>
              <button
                type="button"
                className={w.calendar}
                // The visible label is the week's title, so the name starts
                // with it: someone asking for "This week" by voice gets this.
                aria-label={`${weekLabel(week, weekOffset)}, open calendar`}
                aria-haspopup="dialog"
                onClick={() => setMonthOpen(true)}
              >
                <CalendarIcon />
              </button>
            </div>
            {Math.abs(weekOffset) < 2 ? (
              <p className={w.weekSum}>{weekRange(week)}</p>
            ) : null}
            <p className={w.weekSum}>{weekTotals(week, sessions)}</p>
            {/* Otherwise a daily run simply stops after week 13 and nothing
                says why. Only for an owner who has one. */}
            {hasRepeats &&
            week.days.some((day) => day.afterRepeats && !day.beyond) ? (
              <p className={w.weekSum} data-plan-repeats-through>
                Repeats are added through {shortDateLabel(repeatsThrough)}
              </p>
            ) : null}
          </div>
          <WeekArrow
            label="Next week"
            glyph="›"
            target={weekIndex < weeks.length - 1 ? weekIndex + 1 : null}
            onGo={goToWeek}
          />
        </header>
        <Slide key={week.start}>
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
        </Slide>
      </section>

      <nav className={w.tiles} aria-label="Weeks" ref={tilesRef}>
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
            onClick={() => goToWeek(index)}
          >
            <span className={w.tileLabel}>
              {index === thisWeekIndex
                ? "This wk"
                : shortDateLabel(candidate.start)}
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

      {monthOpen ? (
        <MonthSheet
          today={today}
          firstDate={weeks[0].start}
          lastDate={weeks[weeks.length - 1].end}
          shownWeekStart={week.start}
          sessionCounts={sessionCounts(sessions)}
          onPick={(date) => {
            goToWeek(weekIndexOf(weeks, date, thisWeekIndex));
            setMonthOpen(false);
          }}
          onClose={() => setMonthOpen(false)}
        />
      ) : null}

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
  const planned =
    session.expectedDurationMinutes === null
      ? null
      : `${session.expectedDurationMinutes} min`;
  if (session.log) {
    const outcome = COMPLETION_OUTCOME_LABELS[session.log.outcome];
    return [
      // The planned minutes stay on a logged card (owner, 2 Oct 2026), and
      // say that they are the plan's: beside "Completed" a bare "40 min"
      // reads as time trained, which the Plan does not know.
      planned === null ? null : `${planned} planned`,
      session.log.actualLocalDate === session.localDate
        ? outcome
        : `${outcome} on ${dayLabel(session.log.actualLocalDate)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [planned, session.isLocked ? "Locked" : null]
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [sheet.view]);

  return (
    <SheetLayer
      view={sheet.view}
      labelledBy="plan-sheet-title"
      onClose={onClose}
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
        <SheetCloseButton className={w.sheetClose}>Close</SheetCloseButton>
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
                <span>{saved.title}</span>
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
    </SheetLayer>
  );
}

/** What the month calendar marks: a day holds a session the week would show. */
function sessionCounts(sessions: PlanSessionView[]) {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== "active" && !session.log) continue;
    counts.set(session.localDate, (counts.get(session.localDate) ?? 0) + 1);
  }
  return counts;
}

function CalendarIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
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

/** `offset` is how many weeks the week is from the one holding today. */
function weekLabel(week: PlanWeek, offset: number) {
  if (offset === 0) return "This week";
  if (offset === 1) return "Next week";
  if (offset === -1) return "Last week";
  return weekRange(week);
}

function weekRange(week: PlanWeek) {
  return `${shortDateLabel(week.start)} – ${shortDateLabel(week.end)}`;
}
