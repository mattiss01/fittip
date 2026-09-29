"use client";

/**
 * PROTOTYPE — in-memory state and two unstyled primitives (a bottom sheet and
 * the log form) that every variant dresses in its own classes. Nothing is saved.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import {
  STREAK_BEFORE_WEEK,
  TODAY,
  WEEK,
  type ProtoOutcome,
  type ProtoSession,
} from "./fixture";

export type Signal = "pain" | "illness" | "fatigue";

export type ProtoLog = {
  outcome: ProtoOutcome;
  effort: number;
  signals: Signal[];
};

const TODAY_INDEX = WEEK.findIndex((day) => day.date === TODAY);

/** Runs a state change inside a view transition where the browser has one. */
function withTransition(change: () => void, direction?: "next" | "prev") {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) {
    change();
    return;
  }
  if (direction) document.documentElement.dataset.protoDir = direction;
  doc.startViewTransition(() => flushSync(change));
}

export function useProtoWeek() {
  const [dayIndex, setDayIndex] = useState(TODAY_INDEX);
  const [logs, setLogs] = useState<Record<string, ProtoLog>>(() => {
    const initial: Record<string, ProtoLog> = {};
    for (const day of WEEK) {
      for (const [id, outcome] of Object.entries(day.logged)) {
        initial[id] = { outcome, effort: 4, signals: [] };
      }
    }
    return initial;
  });

  const day = WEEK[dayIndex];

  const go = useCallback((delta: 1 | -1) => {
    setDayIndex((current) => {
      const next = current + delta;
      return next < 0 || next >= WEEK.length ? current : next;
    });
  }, []);

  const goAnimated = useCallback(
    (delta: 1 | -1) =>
      withTransition(() => go(delta), delta === 1 ? "next" : "prev"),
    [go],
  );

  const jumpTo = useCallback(
    (index: number) =>
      withTransition(
        () => setDayIndex(index),
        index > dayIndex ? "next" : "prev",
      ),
    [dayIndex],
  );

  const log = useCallback((sessionId: string, entry: ProtoLog) => {
    setLogs((current) => ({ ...current, [sessionId]: entry }));
  }, []);

  const unlog = useCallback((sessionId: string) => {
    setLogs((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
  }, []);

  /** Per day of the week: kept, missed, open (today/future) or rest. */
  const dayStates = useMemo(
    () =>
      WEEK.map((d, index) => {
        if (d.isRecovery) return index <= TODAY_INDEX ? "rest-kept" : "rest";
        const allLogged = d.sessions.every((s) => logs[s.id]);
        const anyKept = d.sessions.some(
          (s) => logs[s.id] && logs[s.id].outcome !== "skipped",
        );
        if (allLogged && anyKept) return "kept";
        if (index < TODAY_INDEX) return "missed";
        if (d.sessions.some((s) => logs[s.id])) return "partial";
        return "open";
      }),
    [logs],
  );

  const streak = useMemo(() => {
    let count = STREAK_BEFORE_WEEK;
    for (let i = 0; i <= TODAY_INDEX; i += 1) {
      const state = dayStates[i];
      if (state === "kept" || state === "rest-kept") count += 1;
      else if (i === TODAY_INDEX) break;
      else count = 0;
    }
    return count;
  }, [dayStates]);

  const plannedMinutes = WEEK.flatMap((d) => d.sessions).reduce(
    (sum, s) => sum + s.minutes,
    0,
  );
  const doneMinutes = WEEK.flatMap((d) => d.sessions)
    .filter((s) => logs[s.id] && logs[s.id].outcome !== "skipped")
    .reduce(
      (sum, s) =>
        sum +
        (logs[s.id].outcome === "partly"
          ? Math.round(s.minutes / 2)
          : s.minutes),
      0,
    );

  return {
    day,
    dayIndex,
    todayIndex: TODAY_INDEX,
    isToday: dayIndex === TODAY_INDEX,
    isPast: dayIndex < TODAY_INDEX,
    go: goAnimated,
    jumpTo,
    logs,
    log,
    unlog,
    dayStates,
    streak,
    plannedMinutes,
    doneMinutes,
  };
}

/** Horizontal swipe on an element: left goes forward a day, right goes back. */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (!start.current) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}

type SheetClasses = { backdrop: string; sheet: string; grip: string };

/** A bottom sheet that stays mounted so it can animate both ways. */
export function Sheet({
  open,
  onClose,
  label,
  classes,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  classes: SheetClasses;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={classes.backdrop}
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        className={classes.sheet}
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
      >
        <div className={classes.grip} aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

export type LogFormClasses = {
  form: string;
  title: string;
  group: string;
  groupLabel: string;
  choices: string;
  choice: string;
  effortRow: string;
  effortValue: string;
  range: string;
  signals: string;
  signal: string;
  care: string;
  submit: string;
};

const OUTCOMES: { value: ProtoOutcome; label: string }[] = [
  { value: "done", label: "Done" },
  { value: "partly", label: "Some of it" },
  { value: "skipped", label: "Skipped" },
];

const SIGNALS: { value: Signal; label: string }[] = [
  { value: "pain", label: "Pain" },
  { value: "illness", label: "Feeling ill" },
  { value: "fatigue", label: "Wiped out" },
];

const EFFORT_WORDS = [
  "",
  "Very easy",
  "Easy",
  "Easy",
  "Moderate",
  "Moderate",
  "Hard",
  "Hard",
  "Very hard",
  "Very hard",
  "All out",
];

/** The three questions a log asks, in the order people answer them. */
export function LogForm({
  session,
  existing,
  classes,
  onSave,
}: {
  session: ProtoSession;
  existing: ProtoLog | undefined;
  classes: LogFormClasses;
  onSave: (entry: ProtoLog) => void;
}) {
  const [outcome, setOutcome] = useState<ProtoOutcome>(
    existing?.outcome ?? "done",
  );
  const [effort, setEffort] = useState(existing?.effort ?? 6);
  const [signals, setSignals] = useState<Signal[]>(existing?.signals ?? []);

  const toggle = (value: Signal) =>
    setSignals((current) =>
      current.includes(value)
        ? current.filter((s) => s !== value)
        : [...current, value],
    );

  return (
    <form
      className={classes.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ outcome, effort, signals });
      }}
    >
      <p className={classes.title}>{session.title}</p>

      <fieldset className={classes.group}>
        <legend className={classes.groupLabel}>How did it go?</legend>
        <div className={classes.choices}>
          {OUTCOMES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={classes.choice}
              aria-pressed={outcome === option.value}
              onClick={() => setOutcome(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {outcome !== "skipped" && (
        <fieldset className={classes.group}>
          <legend className={classes.groupLabel}>Effort</legend>
          <div className={classes.effortRow}>
            <input
              className={classes.range}
              type="range"
              min={1}
              max={10}
              value={effort}
              aria-label="Effort from 1 to 10"
              onChange={(event) => setEffort(Number(event.target.value))}
            />
            <span className={classes.effortValue}>
              <strong>{effort}</strong> {EFFORT_WORDS[effort]}
            </span>
          </div>
        </fieldset>
      )}

      <fieldset className={classes.group}>
        <legend className={classes.groupLabel}>Anything off?</legend>
        <div className={classes.signals}>
          {SIGNALS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={classes.signal}
              aria-pressed={signals.includes(option.value)}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {signals.length > 0 && (
          <p className={classes.care}>
            Noted. Your coach will suggest an easier few days. Nothing changes
            until you accept it.
          </p>
        )}
      </fieldset>

      <button type="submit" className={classes.submit}>
        Save log
      </button>
    </form>
  );
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
