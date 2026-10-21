/**
 * A workout in progress (ADR-037), as the live screen holds it and the server
 * stores it in `live_workouts.state`.
 *
 * It is a draft of a log, not a log: every value is the string a form holds,
 * as `MeasurementDraft` is, and nothing here decides what is real. Finishing
 * turns it into the log steps' starting rows with `toLoggedActivities`, and
 * the log is validated by the completion write like any other.
 *
 * Lives under `@/lib` rather than `@/server` because the live screen is a
 * Client Component and edits these shapes directly; the server parses them
 * with `parseLiveWorkoutState` before they are stored.
 */

import {
  LOAD_UNITS,
  type LoadUnit,
  type SetGroup,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";
import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type MeasurementBuild,
} from "@/lib/training/measurement-draft";

/** One set, ticked when it is done. A string each, as a form input is. */
export type LiveSet = { reps: string; load: string; done: boolean };

export type LiveActivity = {
  /** Stable across edits, so a row keeps its inputs. */
  key: string;
  /** The planned activity it answers; null for one added while training. */
  plannedPosition: number | null;
  personalActivityId: string | null;
  name: string;
  sport: string;
  /** How it is measured now; the owner may change it while training. */
  mode: TrainingMeasurementMode;
  /** What the plan asked for, and in which mode, shown beside it. */
  target: TrainingMeasurement | null;
  targetMode: TrainingMeasurementMode | null;
  /** `sets_reps_load` only: one row per set, in the order they are done. */
  sets: LiveSet[];
  loadUnit: LoadUnit;
  /** Every other mode: the log's own measurement fields. */
  fields: Record<string, string>;
  /** Ticked by the owner; for sets, any set done. */
  done: boolean;
};

export type LiveWorkoutState = { activities: LiveActivity[] };

/** The running workout as a page reads it. Times are ISO strings. */
export type LiveWorkoutView = {
  id: string;
  revision: number;
  planSessionId: string | null;
  title: string;
  sport: string;
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  state: LiveWorkoutState;
};

/** A log holds at most fifty activities (`COMPLETION_ACTIVITY_LIMIT`). */
export const LIVE_ACTIVITY_LIMIT = 50;
/** More sets than any one exercise is done for; the bound keeps a row sane. */
export const LIVE_SET_LIMIT = 30;

/** Time trained so far: since the start, less every pause. */
export function activeMilliseconds(
  workout: Pick<LiveWorkoutView, "startedAt" | "pausedAt" | "pausedSeconds">,
  now: number,
): number {
  const end =
    workout.pausedAt === null ? now : new Date(workout.pausedAt).valueOf();
  return Math.max(
    0,
    end - new Date(workout.startedAt).valueOf() - workout.pausedSeconds * 1000,
  );
}

/** 0:07, 12:34, 1:02:03. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

let nextKey = 0;

/** A key unique enough within one workout, without a random source. */
export function newActivityKey(): string {
  nextKey += 1;
  return `a${Date.now().toString(36)}${nextKey}`;
}

/**
 * A planned or library activity as it starts a live row: its target copied
 * by value, sets expanded one per row so each can be ticked.
 */
export function liveActivityFrom(source: {
  plannedPosition: number | null;
  personalActivityId: string | null;
  name: string;
  sport: string;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
  key?: string;
}): LiveActivity {
  const base = {
    key: source.key ?? newActivityKey(),
    plannedPosition: source.plannedPosition,
    personalActivityId: source.personalActivityId,
    name: source.name,
    sport: source.sport,
    target: source.target,
    targetMode: source.target === null ? null : source.measurementMode,
    done: false,
  };
  return { ...base, ...measuredAs(base, source.measurementMode) };
}

/**
 * The same activity measured another way. The plan's target is the starting
 * point whenever it was set in that mode; otherwise the fields start empty,
 * and a sets activity starts with one empty set.
 */
export function changeMode(
  activity: LiveActivity,
  mode: TrainingMeasurementMode,
): LiveActivity {
  if (mode === activity.mode) return activity;
  return { ...activity, ...measuredAs(activity, mode), done: false };
}

function measuredAs(
  activity: Pick<LiveActivity, "target" | "targetMode">,
  mode: TrainingMeasurementMode,
): Pick<LiveActivity, "mode" | "sets" | "loadUnit" | "fields"> {
  const fromTarget =
    activity.targetMode === mode && activity.target !== null
      ? draftFromMeasurement(mode, activity.target)
      : emptyDraft(mode);
  if (mode !== "sets_reps_load") {
    return { mode, sets: [], loadUnit: "kg", fields: fromTarget.fields };
  }
  const sets: LiveSet[] = [];
  for (const group of fromTarget.groups) {
    const count = Math.max(1, Number.parseInt(group.sets, 10) || 1);
    for (let i = 0; i < count && sets.length < LIVE_SET_LIMIT; i += 1) {
      sets.push({ reps: group.reps, load: group.load, done: false });
    }
  }
  if (sets.length === 0) sets.push({ reps: "", load: "", done: false });
  return {
    mode,
    sets,
    loadUnit: readLoadUnit(fromTarget.fields.load_unit),
    fields: {},
  };
}

function readLoadUnit(value: string | undefined): LoadUnit {
  return (LOAD_UNITS as readonly string[]).includes(value ?? "")
    ? (value as LoadUnit)
    : "kg";
}

/** A sets activity counts as done once any set is. */
export function withSets(
  activity: LiveActivity,
  sets: LiveSet[],
): LiveActivity {
  return { ...activity, sets, done: sets.some((set) => set.done) };
}

/**
 * What was done, as the log stores it: the done sets collapsed into the log's
 * groups (3×8 at 60 kg, then 1×5 at 70 kg), every other mode built from its
 * fields. An unticked set is not recorded.
 */
export function actualMeasurement(activity: LiveActivity): MeasurementBuild {
  if (activity.mode !== "sets_reps_load") {
    return buildMeasurement(activity.mode, {
      fields: activity.fields,
      groups: [],
    });
  }
  const groups: { sets: number; reps: string; load: string }[] = [];
  for (const set of activity.sets.filter((candidate) => candidate.done)) {
    const last = groups.at(-1);
    if (last && last.reps === set.reps && last.load === set.load) {
      last.sets += 1;
    } else {
      groups.push({ sets: 1, reps: set.reps, load: set.load });
    }
  }
  if (groups.length === 0) return { ok: true, measurement: null };
  return buildMeasurement("sets_reps_load", {
    fields: { load_unit: activity.loadUnit },
    groups: groups.map((group) => ({ ...group, sets: String(group.sets) })),
  });
}

/** The groups a sets target asks for, for the line beside a live activity. */
export function targetGroups(target: TrainingMeasurement | null): SetGroup[] {
  if (target === null) return [];
  if ("groups" in target) return target.groups;
  if ("sets" in target) return [target];
  return [];
}

/**
 * The done activities as the log steps start from them, in the order of the
 * workout. A measurement that does not build is carried as no measurement, so
 * the log's own row shows it empty to be filled in rather than refusing the
 * whole hand-over.
 */
export function toLoggedActivities(state: LiveWorkoutState): {
  plannedPosition: number | null;
  personalActivityId: string | null;
  name: string;
  sport: string;
  measurementMode: TrainingMeasurementMode;
  actual: TrainingMeasurement | null;
}[] {
  return state.activities
    .filter((activity) => activity.done && activity.name.trim() !== "")
    .map((activity) => {
      const built = actualMeasurement(activity);
      return {
        plannedPosition: activity.plannedPosition,
        personalActivityId: activity.personalActivityId,
        name: activity.name.trim(),
        sport: activity.sport.trim(),
        measurementMode: activity.mode,
        actual: built.ok ? built.measurement : null,
      };
    });
}
