"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  discardLiveWorkoutAction,
  pauseLiveWorkoutAction,
  saveLiveWorkoutAction,
  type LiveSaveResult,
} from "./actions";
import styles from "./live.module.css";

import {
  useHoldReorder,
  type HoldProps,
  type KeyMoveProps,
} from "@/components/hold/use-hold-reorder";
import type { LibraryActivityOption } from "@/components/training/activity-editor";
import { LibraryPicker } from "@/components/training/library-picker";
import {
  MeasurementFields,
  MeasurementModeField,
} from "@/components/training/measurement-fields";
import { useLiveClock } from "@/components/home/live-workout-clock";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  actualMeasurement,
  changeMode,
  emptyRepeat,
  emptySet,
  LIVE_ACTIVITY_LIMIT,
  LIVE_REPEAT_LIMIT,
  LIVE_SET_LIMIT,
  liveActivityFrom,
  withRepeats,
  withSets,
  type LiveActivity,
  type LiveRepeat,
  type LiveSet,
  type LiveWorkoutState,
  type LiveWorkoutView,
} from "@/lib/training/live-workout";
import type { TrainingMeasurementMode } from "@/lib/training/measurement";
import { writeClock } from "@/lib/training/measurement-draft";
import {
  startingMode,
  type ModeBySport,
} from "@/lib/training/measurement-default";

type SaveStatus = "saved" | "saving" | "failed" | "conflict" | "session";

/** How long the screen waits after a change before it stores it. */
const SAVE_DELAY_MS = 600;

/**
 * Logging a session live (owner, 21 Oct 2026; the prototype's variant A,
 * "one list"): the whole workout on one page, one clock for all of it, every
 * activity with its own controls, ticked as it is done. No rest timer and no
 * per-activity timers, by the owner's choice.
 *
 * Every change is stored a moment after it is made, answering to the revision
 * the screen last saw, so a reload, a phone that sleeps or another device
 * picks it up where it was. Finish stores what is pending and opens the log
 * steps filled in from it; nothing is a log until those are saved.
 */
export function LiveWorkout({
  workout,
  library,
  modes,
}: {
  workout: LiveWorkoutView;
  library: readonly LibraryActivityOption[];
  modes: ModeBySport;
}) {
  const router = useRouter();
  const prefix = useId();
  const [view, setView] = useState(workout);
  const [activities, setActivities] = useState(workout.state.activities);
  // The newest order, for a drag: it moves a card many times between renders.
  const latest = useRef(workout.state.activities);
  const list = useRef<HTMLOListElement>(null);
  // The page scrolls under a lifted card once it nears the sticky clock.
  const { dragging, hold, keys, hint } = useHoldReorder(
    list,
    moveTo,
    () =>
      list.current
        ?.closest("[data-live-workout]")
        ?.querySelector("header")
        ?.getBoundingClientRect().bottom ?? 0,
  );
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [finishing, startFinishing] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const clock = useLiveClock(view);

  // What is stored, and what is waiting to be. Refs, so a save that lands
  // after a newer change does not undo it. Every write - a save, a pause -
  // runs through one queue, so each answers to the revision the one before
  // it left, and nothing reports "stored" while an earlier write is still
  // on its way.
  const revision = useRef(workout.revision);
  const pausedAt = useRef(workout.pausedAt);
  const pending = useRef<LiveWorkoutState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }

  // A conflict or an ended session stays said until the page is reloaded:
  // every later write would meet the same answer.
  const stuck = (current: SaveStatus) =>
    current === "conflict" || current === "session";

  function settle(result: LiveSaveResult): boolean {
    if (result.status === "saved") {
      revision.current = result.workout.revision;
      pausedAt.current = result.workout.pausedAt;
      setView(result.workout);
      return true;
    }
    setStatus(
      result.status === "conflict"
        ? "conflict"
        : result.status === "session"
          ? "session"
          : "failed",
    );
    return false;
  }

  /** Stores what is waiting, after every write already queued. */
  function flush(): Promise<boolean> {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return enqueue(async () => {
      const state = pending.current;
      if (state === null) return true;
      pending.current = null;
      setStatus((current) => (stuck(current) ? current : "saving"));
      const ok = settle(
        await saveLiveWorkoutAction(view.id, revision.current, state),
      );
      // A failed save keeps what it was trying to store, so Retry sends it.
      if (!ok && pending.current === null) pending.current = state;
      if (ok && pending.current === null) setStatus("saved");
      return ok;
    });
  }

  function change(next: LiveActivity[]) {
    latest.current = next;
    setActivities(next);
    pending.current = { activities: next };
    setStatus((current) => (stuck(current) ? current : "saving"));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  // Store what is pending if the page is hidden: a phone put away mid-set.
  const flushLatest = useRef(flush);
  useEffect(() => {
    flushLatest.current = flush;
  });
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushLatest.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  function update(key: string, edit: (activity: LiveActivity) => LiveActivity) {
    change(
      activities.map((activity) =>
        activity.key === key ? edit(activity) : activity,
      ),
    );
  }

  /** Moves an activity to another place in the list (owner, 28 Oct 2026). */
  function moveTo(key: string, to: number) {
    const current = latest.current;
    const from = current.findIndex((activity) => activity.key === key);
    if (from < 0 || to < 0 || to >= current.length || from === to) return;
    const next = [...current];
    const [held] = next.splice(from, 1);
    next.splice(to, 0, held);
    change(next);
  }

  async function togglePause() {
    if (!(await flush())) return;
    await enqueue(async () => {
      setStatus((current) => (stuck(current) ? current : "saving"));
      const result = await pauseLiveWorkoutAction(
        view.id,
        revision.current,
        pausedAt.current === null,
      );
      if (settle(result) && pending.current === null) setStatus("saved");
    });
  }

  function finish() {
    startFinishing(async () => {
      if (await flush()) router.push(`/home/log?workout=${view.id}`);
    });
  }

  const paused = view.pausedAt !== null;
  const sessionSport = view.sport;

  return (
    <div className={styles.live} data-live-workout data-live-save={status}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <Link className={styles.headLink} href="/home/today">
            ‹ Today
          </Link>
          <span className={styles.headTitle}>{view.title}</span>
        </div>
        <strong
          className={styles.clock}
          data-live-clock
          aria-label={`${paused ? "Paused at" : "Trained"} ${clock}`}
        >
          {clock}
        </strong>
        <div className={styles.clockActions}>
          <button
            type="button"
            className={styles.pause}
            onClick={() => void togglePause()}
            aria-pressed={paused}
          >
            {paused ? "▶ Continue" : "❚❚ Pause"}
          </button>
          <button
            type="button"
            className={styles.finish}
            onClick={finish}
            disabled={finishing}
          >
            Finish
          </button>
        </div>
        <SaveLine status={status} onRetry={() => void flush()} />
      </header>

      {activities.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet. Add what you do as you go.
        </p>
      ) : null}

      <p {...hint} />
      <ol className={styles.activities} ref={list}>
        {activities.map((activity, index) => (
          <ActivityCard
            key={activity.key}
            idPrefix={`${prefix}-${index}`}
            activity={activity}
            dragging={dragging === activity.key}
            hold={activities.length < 2 ? undefined : hold(activity.key)}
            move={activities.length < 2 ? undefined : keys(activity.key)}
            onChange={(edit) => update(activity.key, edit)}
            onRemove={
              activity.plannedPosition === null
                ? () => change(activities.filter((a) => a.key !== activity.key))
                : undefined
            }
          />
        ))}
      </ol>

      <AddActivity
        idPrefix={prefix}
        disabled={activities.length >= LIVE_ACTIVITY_LIMIT}
        library={library}
        onAdd={(added) => change([...activities, added])}
        sessionSport={sessionSport}
        modes={modes}
        previousMode={activities.at(-1)?.mode ?? null}
      />

      <div className={styles.end}>
        <button
          type="button"
          className={styles.finishWide}
          onClick={finish}
          disabled={finishing}
        >
          {finishing ? "Saving…" : "Finish and log"}
        </button>
        {confirmDiscard ? (
          <form action={discardLiveWorkoutAction} className={styles.discard}>
            <input type="hidden" name="id" value={view.id} />
            <p>Discard this workout? Nothing is logged and it is gone.</p>
            <div className={styles.row}>
              <button type="submit" className={styles.danger}>
                Discard workout
              </button>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => setConfirmDiscard(false)}
              >
                Keep it
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className={styles.discardButton}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard workout
          </button>
        )}
      </div>
    </div>
  );
}

function SaveLine({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  // Storing is quiet (owner, 22 Oct 2026): only a problem is said.
  if (status === "saved" || status === "saving") return null;
  if (status === "conflict") {
    return (
      <p className={styles.saveProblem} role="alert">
        This workout changed somewhere else.{" "}
        <a href="/home/log/live">Reload it</a>
      </p>
    );
  }
  if (status === "session") {
    return (
      <p className={styles.saveProblem} role="alert">
        Your session ended. <Link href="/">Sign in again</Link>; what was stored
        is kept.
      </p>
    );
  }
  return (
    <p className={styles.saveProblem} role="alert">
      Not saved yet.{" "}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </p>
  );
}

function ActivityCard({
  idPrefix,
  activity,
  dragging,
  hold,
  move,
  onChange,
  onRemove,
}: {
  idPrefix: string;
  activity: LiveActivity;
  dragging: boolean;
  /** What lets the card's head be held and dragged; absent while alone. */
  hold?: HoldProps;
  /** The arrow keys on the card's fold button; absent while alone. */
  move?: KeyMoveProps;
  onChange: (edit: (activity: LiveActivity) => LiveActivity) => void;
  onRemove?: () => void;
}) {
  const validity = useRef<HTMLInputElement>(null);
  const [measuring, setMeasuring] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Only a planned activity has a plan to show: one added from the library
  // carries its usual target as a starting point, not as a plan (owner,
  // 22 Oct 2026).
  const plan =
    activity.plannedPosition === null
      ? null
      : describeMeasurement(activity.target);
  const doneSets = activity.sets.filter((set) => set.done).length;
  const finished = isFinished(activity);
  // A finished activity folds to one line so the open ones keep the room
  // (owner, 22 Oct 2026). It folds as it is finished; the owner can open it
  // again, or fold any other by hand.
  const [open, setOpen] = useState(!finished);
  const [wasFinished, setWasFinished] = useState(finished);
  if (finished !== wasFinished) {
    setWasFinished(finished);
    setOpen(!finished);
  }
  const progress =
    activity.mode === "sets_reps_load"
      ? `${doneSets} of ${activity.sets.length} sets`
      : activity.mode === "intervals"
        ? `${activity.repeats.filter((r) => r.done).length} of ${activity.repeats.length}`
        : activity.done
          ? "Done"
          : "";
  const named = activity.name !== "";
  const cardClass = [
    styles.card,
    activity.done ? styles.cardDone : "",
    dragging ? styles.cardDragging : "",
  ].join(" ");

  if (!open && named) {
    const built = actualMeasurement(activity);
    const did = built.ok ? describeMeasurement(built.measurement) : null;
    return (
      <li
        className={`${cardClass} ${styles.cardFolded}`}
        data-live-activity={activity.name}
        data-hold-key={activity.key}
        data-live-folded
      >
        <button
          type="button"
          className={styles.foldToggle}
          aria-expanded={false}
          onClick={() => setOpen(true)}
          {...hold}
          {...move}
        >
          <span className={styles.foldText}>
            <strong>{activity.name}</strong>
            {did === null ? null : <small>{did}</small>}
          </span>
          <span className={styles.progress}>{progress}</span>
          <span className={styles.chevron} aria-hidden="true" />
        </button>
      </li>
    );
  }

  return (
    <li
      className={cardClass}
      data-live-activity={activity.name}
      data-hold-key={activity.key}
    >
      <div className={styles.cardHead} {...hold}>
        <div className={styles.cardName}>
          {activity.plannedPosition === null && activity.name === "" ? (
            <input
              className={styles.nameInput}
              aria-label="Activity name"
              placeholder="What is it?"
              maxLength={120}
              autoFocus
              onBlur={(event) =>
                onChange((a) => ({ ...a, name: event.target.value.trim() }))
              }
            />
          ) : (
            <h2 className={styles.cardTitle}>{activity.name}</h2>
          )}
          {plan === null ? null : <p className={styles.plan}>Plan: {plan}</p>}
        </div>
        <span className={styles.progress}>{progress}</span>
        {named ? (
          <button
            type="button"
            className={styles.foldClose}
            aria-expanded={true}
            aria-label={`Fold ${activity.name}`}
            onClick={() => setOpen(false)}
            {...move}
          >
            <span className={styles.chevron} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {activity.mode === "sets_reps_load" ? (
        <SetRows
          idPrefix={idPrefix}
          activity={activity}
          onSets={(sets) => onChange((a) => withSets(a, sets))}
        />
      ) : activity.mode === "intervals" ? (
        <RepeatRows
          idPrefix={idPrefix}
          activity={activity}
          onRepeats={(repeats) => onChange((a) => withRepeats(a, repeats))}
        />
      ) : (
        <>
          <MeasurementFields
            idPrefix={idPrefix}
            mode={activity.mode}
            draft={{ fields: activity.fields, groups: [] }}
            validityRef={validity}
            onDraftChange={(field, value) =>
              onChange((a) => ({
                ...a,
                fields: { ...a.fields, [field]: value },
              }))
            }
            onGroupsChange={() => {}}
          />
          <input ref={validity} hidden readOnly tabIndex={-1} />
          <button
            type="button"
            className={activity.done ? styles.doneOn : styles.doneButton}
            aria-pressed={activity.done}
            onClick={() => onChange((a) => ({ ...a, done: !a.done }))}
          >
            {activity.done ? "✓ Done" : "Mark done"}
          </button>
        </>
      )}

      <div className={styles.cardFoot}>
        <button
          type="button"
          className={styles.footButton}
          aria-expanded={measuring}
          onClick={() => setMeasuring((open) => !open)}
        >
          Change how it is measured
        </button>
        {onRemove && !confirmRemove ? (
          <button
            type="button"
            className={`${styles.footButton} ${styles.footRemove}`}
            onClick={() =>
              hasContent(activity) ? setConfirmRemove(true) : onRemove()
            }
          >
            Remove
          </button>
        ) : null}
      </div>
      {/* A second step once something is in it, so a stray tap does not
          take what was entered (owner, 22 Oct 2026). */}
      {onRemove && confirmRemove ? (
        <div className={styles.removeConfirm}>
          <p>Remove {activity.name || "this activity"} and what is in it?</p>
          <div className={styles.row}>
            <button type="button" className={styles.danger} onClick={onRemove}>
              Remove
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setConfirmRemove(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}
      {measuring ? (
        <MeasurementModeField
          id={`${idPrefix}-mode`}
          mode={activity.mode}
          onChange={(mode) => {
            onChange((a) => changeMode(a, mode));
            setMeasuring(false);
          }}
        />
      ) : null}
    </li>
  );
}

/** Every set or repeat ticked, or, measured otherwise, marked done. */
function isFinished(activity: LiveActivity): boolean {
  if (activity.mode === "sets_reps_load") {
    return activity.sets.length > 0 && activity.sets.every((set) => set.done);
  }
  if (activity.mode === "intervals") {
    return (
      activity.repeats.length > 0 &&
      activity.repeats.every((repeat) => repeat.done)
    );
  }
  return activity.done;
}

/** Anything the owner would lose: a name, a number, a tick. */
function hasContent(activity: LiveActivity): boolean {
  return (
    activity.name !== "" ||
    activity.done ||
    activity.sets.some((set) => set.reps || set.time || set.load) ||
    activity.repeats.some((r) => r.distance || r.time || r.rest) ||
    Object.values(activity.fields).some((value) => value !== "")
  );
}

function SetRows({
  idPrefix,
  activity,
  onSets,
}: {
  idPrefix: string;
  activity: LiveActivity;
  onSets: (sets: LiveSet[]) => void;
}) {
  const { sets } = activity;
  const edit = (index: number, change: Partial<LiveSet>) =>
    onSets(sets.map((set, i) => (i === index ? { ...set, ...change } : set)));

  return (
    <>
      <ol className={styles.sets}>
        {sets.map((set, index) => (
          <li key={index} className={set.done ? styles.setDone : undefined}>
            <span className={styles.setNumber}>{index + 1}</span>
            {set.by === "time" ? (
              <Stepper
                id={`${idPrefix}-time-${index}`}
                label={`Set ${index + 1} time`}
                unit="time"
                value={set.time}
                step={5}
                clock
                onChange={(time) => edit(index, { time })}
              />
            ) : (
              <Stepper
                id={`${idPrefix}-reps-${index}`}
                label={`Set ${index + 1} reps`}
                unit="reps"
                value={set.reps}
                step={1}
                onChange={(reps) => edit(index, { reps })}
              />
            )}
            <Stepper
              id={`${idPrefix}-load-${index}`}
              label={`Set ${index + 1} load`}
              unit={activity.loadUnit}
              value={set.load}
              step={2.5}
              onChange={(load) => edit(index, { load })}
            />
            <button
              type="button"
              className={set.done ? styles.tickOn : styles.tick}
              aria-pressed={set.done}
              aria-label={`Set ${index + 1} done`}
              onClick={() => edit(index, { done: !set.done })}
            >
              <CheckMark />
            </button>
            <RemoveRow
              label={`Remove set ${index + 1}`}
              hidden={sets.length === 1}
              onRemove={() => onSets(sets.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ol>
      <div className={styles.rowTools}>
        {/* Counted or held (ADR-038): a plank is timed, a squat is not. */}
        <div className={styles.segmented} role="group" aria-label="Each set">
          {(["reps", "time"] as const).map((by) => (
            <button
              key={by}
              type="button"
              aria-pressed={sets.every((set) => set.by === by)}
              onClick={() => onSets(sets.map((set) => ({ ...set, by })))}
            >
              {by === "reps" ? "Reps" : "Time"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.addRow}
          disabled={sets.length >= LIVE_SET_LIMIT}
          onClick={() => {
            const last = sets.at(-1);
            onSets([
              ...sets,
              last === undefined ? emptySet() : { ...last, done: false },
            ]);
          }}
        >
          + Add set
        </button>
      </div>
    </>
  );
}

/**
 * Takes one set or repeat away, beside its tick (owner, 22 Oct 2026). Kept
 * in its place while hidden, so the last row lines up with the others.
 */
function RemoveRow({
  label,
  hidden,
  onRemove,
}: {
  label: string;
  hidden: boolean;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.removeRow}
      aria-label={label}
      hidden={hidden}
      onClick={onRemove}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </button>
  );
}

/**
 * Intervals live (ADR-038): one row per repeat, its distance and time as
 * planned and adjustable, ticked when done. No timer, by the owner's choice:
 * a repeat's time is typed or nudged, not run.
 */
function RepeatRows({
  idPrefix,
  activity,
  onRepeats,
}: {
  idPrefix: string;
  activity: LiveActivity;
  onRepeats: (repeats: LiveRepeat[]) => void;
}) {
  const { repeats } = activity;
  const edit = (index: number, change: Partial<LiveRepeat>) =>
    onRepeats(
      repeats.map((repeat, i) =>
        i === index ? { ...repeat, ...change } : repeat,
      ),
    );
  // Kilometres and miles step by a tenth, metres and yards by fifty.
  const distanceStep =
    activity.distanceUnit === "km" || activity.distanceUnit === "mi" ? 0.1 : 50;

  return (
    <>
      <ol className={styles.sets}>
        {repeats.map((repeat, index) => (
          <li key={index} className={repeat.done ? styles.setDone : undefined}>
            <span className={styles.setNumber}>{index + 1}</span>
            {/* Always offered: an interval added live, or switched to, has
                no planned distance to start from. */}
            <Stepper
              id={`${idPrefix}-distance-${index}`}
              label={`Repeat ${index + 1} distance`}
              unit={activity.distanceUnit}
              value={repeat.distance}
              step={distanceStep}
              onChange={(distance) => edit(index, { distance })}
            />
            <Stepper
              id={`${idPrefix}-rtime-${index}`}
              label={`Repeat ${index + 1} time`}
              unit="time"
              value={repeat.time}
              step={5}
              clock
              onChange={(time) => edit(index, { time })}
            />
            <button
              type="button"
              className={repeat.done ? styles.tickOn : styles.tick}
              aria-pressed={repeat.done}
              aria-label={`Repeat ${index + 1} done`}
              onClick={() => edit(index, { done: !repeat.done })}
            >
              <CheckMark />
            </button>
            <RemoveRow
              label={`Remove repeat ${index + 1}`}
              hidden={repeats.length === 1}
              onRemove={() => onRepeats(repeats.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ol>
      <div className={styles.rowTools}>
        <button
          type="button"
          className={styles.addRow}
          disabled={repeats.length >= LIVE_REPEAT_LIMIT}
          onClick={() => {
            const last = repeats.at(-1);
            onRepeats([
              ...repeats,
              last === undefined ? emptyRepeat() : { ...last, done: false },
            ]);
          }}
        >
          + Add repeat
        </button>
      </div>
    </>
  );
}

/** A drawn check, crisper than a glyph at this size. */
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Stepper({
  id,
  label,
  unit,
  value,
  step,
  clock = false,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  step: number;
  /** A time, read and written as `0:45` / `1:30`; `step` is seconds. */
  clock?: boolean;
  onChange: (value: string) => void;
}) {
  const nudge = (direction: 1 | -1) => {
    if (clock) {
      const next = Math.max(0, clockSeconds(value) + direction * step);
      onChange(next === 0 ? "" : writeClock(next));
      return;
    }
    const current = Number(value.replace(",", ".")) || 0;
    const next = Math.max(
      0,
      Math.round((current + direction * step) * 100) / 100,
    );
    onChange(String(next));
  };
  return (
    <span className={styles.stepper}>
      <button
        type="button"
        aria-label={`${label} less`}
        onClick={() => nudge(-1)}
      >
        −
      </button>
      <input
        id={id}
        aria-label={`${label} (${unit})`}
        inputMode="decimal"
        value={value}
        maxLength={8}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>{unit}</small>
      <button
        type="button"
        aria-label={`${label} more`}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </span>
  );
}

/** `1:30` or a bare `45` to seconds; anything else counts as none. */
function clockSeconds(value: string): number {
  const parts = value.trim().split(":");
  if (parts.some((part) => !/^\d+$/.test(part)) || parts.length > 3) return 0;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

function AddActivity({
  idPrefix,
  disabled,
  library,
  onAdd,
  sessionSport,
  modes,
  previousMode,
}: {
  idPrefix: string;
  disabled: boolean;
  library: readonly LibraryActivityOption[];
  onAdd: (activity: LiveActivity) => void;
  sessionSport: string;
  modes: ModeBySport;
  /** How the activity before it is measured, which a new one starts as. */
  previousMode: TrainingMeasurementMode | null;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className={styles.add}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.secondary}
          disabled={disabled}
          onClick={() =>
            onAdd(
              liveActivityFrom({
                plannedPosition: null,
                personalActivityId: null,
                name: "",
                sport: sessionSport,
                // Measured as the activity before it (owner, 21 Oct
                // 2026); the first one as this sport last was.
                measurementMode:
                  previousMode ?? startingMode(sessionSport, modes, null),
                target: null,
              }),
            )
          }
        >
          + Add activity
        </button>
        {library.length === 0 ? null : (
          <button
            type="button"
            className={styles.secondary}
            disabled={disabled}
            aria-expanded={picking}
            aria-controls={`${idPrefix}-library`}
            onClick={() => setPicking((open) => !open)}
          >
            From your library
          </button>
        )}
      </div>
      {picking && !disabled ? (
        <LibraryPicker
          id={`${idPrefix}-library`}
          options={library}
          onPick={(option) => {
            onAdd(
              liveActivityFrom({
                plannedPosition: null,
                personalActivityId: option.id,
                name: option.name,
                sport: option.sport,
                measurementMode: option.measurementMode,
                target: option.target,
              }),
            );
            setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
