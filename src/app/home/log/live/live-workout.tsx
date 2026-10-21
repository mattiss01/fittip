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

import type { LibraryActivityOption } from "@/components/training/activity-editor";
import { LibraryPicker } from "@/components/training/library-picker";
import {
  MeasurementFields,
  MeasurementModeField,
} from "@/components/training/measurement-fields";
import { useLiveClock } from "@/components/home/live-workout-clock";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  changeMode,
  LIVE_ACTIVITY_LIMIT,
  LIVE_SET_LIMIT,
  liveActivityFrom,
  withSets,
  type LiveActivity,
  type LiveSet,
  type LiveWorkoutState,
  type LiveWorkoutView,
} from "@/lib/training/live-workout";
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
    <div className={styles.live} data-live-workout>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <Link className={styles.headLink} href="/home/today">
            ‹ Today
          </Link>
          <span className={styles.headTitle}>{view.title}</span>
          <button
            type="button"
            className={styles.finish}
            onClick={finish}
            disabled={finishing}
          >
            Finish
          </button>
        </div>
        <div className={styles.clockRow}>
          <strong
            className={styles.clock}
            data-live-clock
            aria-label={`${paused ? "Paused at" : "Trained"} ${clock}`}
          >
            {clock}
          </strong>
          <button
            type="button"
            className={styles.pause}
            onClick={() => void togglePause()}
            aria-pressed={paused}
          >
            {paused ? "▶ Continue" : "❚❚ Pause"}
          </button>
        </div>
        <SaveLine status={status} onRetry={() => void flush()} />
      </header>

      {activities.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet. Add what you do as you go.
        </p>
      ) : null}

      <ol className={styles.activities}>
        {activities.map((activity, index) => (
          <ActivityCard
            key={activity.key}
            idPrefix={`${prefix}-${index}`}
            activity={activity}
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
            className={styles.quiet}
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
  if (status === "saved" || status === "saving") {
    return (
      <p className={styles.saveLine} aria-live="polite">
        {status === "saving" ? "Saving…" : "Saved"}
      </p>
    );
  }
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
  onChange,
  onRemove,
}: {
  idPrefix: string;
  activity: LiveActivity;
  onChange: (edit: (activity: LiveActivity) => LiveActivity) => void;
  onRemove?: () => void;
}) {
  const validity = useRef<HTMLInputElement>(null);
  const [measuring, setMeasuring] = useState(false);
  const plan = describeMeasurement(activity.target);
  const doneSets = activity.sets.filter((set) => set.done).length;

  return (
    <li
      className={`${styles.card} ${activity.done ? styles.cardDone : ""}`}
      data-live-activity={activity.name}
    >
      <div className={styles.cardHead}>
        <div>
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
        <span className={styles.progress}>
          {activity.mode === "sets_reps_load"
            ? `${doneSets} of ${activity.sets.length} sets`
            : activity.done
              ? "Done"
              : ""}
        </span>
      </div>

      {activity.mode === "sets_reps_load" ? (
        <SetRows
          idPrefix={idPrefix}
          activity={activity}
          onSets={(sets) => onChange((a) => withSets(a, sets))}
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
          className={styles.quiet}
          aria-expanded={measuring}
          onClick={() => setMeasuring((open) => !open)}
        >
          Change how it is measured
        </button>
        {onRemove ? (
          <button type="button" className={styles.quiet} onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
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
            <Stepper
              id={`${idPrefix}-reps-${index}`}
              label={`Set ${index + 1} reps`}
              unit="reps"
              value={set.reps}
              step={1}
              onChange={(reps) => edit(index, { reps })}
            />
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
              ✓
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.quiet}
          disabled={sets.length >= LIVE_SET_LIMIT}
          onClick={() => {
            const last = sets.at(-1);
            onSets([
              ...sets,
              { reps: last?.reps ?? "", load: last?.load ?? "", done: false },
            ]);
          }}
        >
          + set
        </button>
        {sets.length > 1 && !sets.at(-1)?.done ? (
          <button
            type="button"
            className={styles.quiet}
            onClick={() => onSets(sets.slice(0, -1))}
          >
            − set
          </button>
        ) : null}
      </div>
    </>
  );
}

function Stepper({
  id,
  label,
  unit,
  value,
  step,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  step: number;
  onChange: (value: string) => void;
}) {
  const nudge = (direction: 1 | -1) => {
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

function AddActivity({
  idPrefix,
  disabled,
  library,
  onAdd,
  sessionSport,
  modes,
}: {
  idPrefix: string;
  disabled: boolean;
  library: readonly LibraryActivityOption[];
  onAdd: (activity: LiveActivity) => void;
  sessionSport: string;
  modes: ModeBySport;
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
                measurementMode: startingMode(sessionSport, modes, null),
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
