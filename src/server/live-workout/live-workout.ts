import "server-only";

import {
  LIVE_ACTIVITY_LIMIT,
  LIVE_SET_LIMIT,
  type LiveActivity,
  type LiveWorkoutState,
} from "@/lib/training/live-workout";
import { LOAD_UNITS, type LoadUnit } from "@/lib/training/measurement";
import { MEASUREMENT_FIELDS } from "@/lib/training/measurement-draft";
import {
  parseTrainingMeasurement,
  TRAINING_MEASUREMENT_MODES,
} from "@/server/training/training-measurements";

/**
 * The server's reading of a workout in progress (ADR-037). The client edits
 * `LiveWorkoutState` freely; this decides what may be stored. It is a draft's
 * check, not a log's: values stay the strings a form holds, bounded in count
 * and length, and what they become is decided again by the completion write
 * when the workout is logged.
 */

export class LiveWorkoutValidationError extends Error {
  constructor() {
    super("The workout is invalid.");
    this.name = "LiveWorkoutValidationError";
  }
}

/** Changed elsewhere since it was read, or no longer there. */
export class LiveWorkoutConflictError extends Error {
  constructor() {
    super("The workout changed. Reload and try again.");
    this.name = "LiveWorkoutConflictError";
  }
}

/** A second start while one is running: one per owner. */
export class LiveWorkoutRunningError extends Error {
  constructor() {
    super("A workout is already running.");
    this.name = "LiveWorkoutRunningError";
  }
}

export class LiveWorkoutPersistenceError extends Error {
  constructor() {
    super("The workout could not be stored.");
    this.name = "LiveWorkoutPersistenceError";
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A workout's id as a form or a caller hands it in. */
export function isLiveWorkoutId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Every flat field any mode binds; a mode change leaves the others behind. */
const FIELD_NAMES = new Set(Object.values(MEASUREMENT_FIELDS).flat());

function invalid(): never {
  throw new LiveWorkoutValidationError();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid();
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid();
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) invalid();
  return value;
}

export function parseLiveWorkoutState(value: unknown): LiveWorkoutState {
  const state = record(value);
  onlyKeys(state, ["activities"]);
  if (
    !Array.isArray(state.activities) ||
    state.activities.length > LIVE_ACTIVITY_LIMIT
  ) {
    invalid();
  }
  const activities = state.activities.map(parseActivity);
  const keys = new Set(activities.map((activity) => activity.key));
  const planned = activities
    .map((activity) => activity.plannedPosition)
    .filter((position) => position !== null);
  // A planned activity is answered once, as a log's actual is
  // (`completion_activities_planned_key`).
  if (
    keys.size !== activities.length ||
    new Set(planned).size !== planned.length
  ) {
    invalid();
  }
  return { activities };
}

function parseActivity(value: unknown): LiveActivity {
  const activity = record(value);
  onlyKeys(activity, [
    "key",
    "plannedPosition",
    "personalActivityId",
    "name",
    "sport",
    "mode",
    "target",
    "targetMode",
    "sets",
    "loadUnit",
    "fields",
    "done",
  ]);
  const key = text(activity.key, 40);
  if (key === "") invalid();

  const plannedPosition = activity.plannedPosition;
  if (
    plannedPosition !== null &&
    (!Number.isInteger(plannedPosition) ||
      (plannedPosition as number) < 0 ||
      (plannedPosition as number) >= LIVE_ACTIVITY_LIMIT)
  ) {
    invalid();
  }
  const personalActivityId = activity.personalActivityId;
  if (
    personalActivityId !== null &&
    (typeof personalActivityId !== "string" || !UUID.test(personalActivityId))
  ) {
    invalid();
  }

  const mode = readMode(activity.mode);
  const targetMode =
    activity.targetMode === null ? null : readMode(activity.targetMode);
  // The plan's target, carried for display: checked as a target of its own
  // mode so a stored workout never holds a shape nothing can draw.
  let target = null;
  if (activity.target !== null) {
    if (targetMode === null) invalid();
    try {
      target = parseTrainingMeasurement(targetMode, activity.target);
    } catch {
      invalid();
    }
  }

  if (!Array.isArray(activity.sets) || activity.sets.length > LIVE_SET_LIMIT) {
    invalid();
  }
  const sets = activity.sets.map((value) => {
    const set = record(value);
    onlyKeys(set, ["reps", "load", "done"]);
    if (typeof set.done !== "boolean") invalid();
    return {
      reps: text(set.reps, 12),
      load: text(set.load, 12),
      done: set.done,
    };
  });
  if (mode !== "sets_reps_load" && sets.length > 0) invalid();

  const loadUnit = activity.loadUnit;
  if (!(LOAD_UNITS as readonly unknown[]).includes(loadUnit)) invalid();

  const rawFields = record(activity.fields);
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(rawFields)) {
    if (!FIELD_NAMES.has(name)) invalid();
    fields[name] = text(value, 500);
  }

  if (typeof activity.done !== "boolean") invalid();

  return {
    key,
    plannedPosition: plannedPosition as number | null,
    personalActivityId: personalActivityId as string | null,
    name: text(activity.name, 120),
    sport: text(activity.sport, 80),
    mode,
    target,
    targetMode,
    sets,
    loadUnit: loadUnit as LoadUnit,
    fields,
    done: activity.done,
  };
}

function readMode(value: unknown) {
  if (!(TRAINING_MEASUREMENT_MODES as readonly unknown[]).includes(value)) {
    invalid();
  }
  return value as (typeof TRAINING_MEASUREMENT_MODES)[number];
}

/** A name a workout and the log it becomes can carry. */
export function parseLiveWorkoutName(title: unknown, sport: unknown) {
  if (typeof title !== "string" || typeof sport !== "string") invalid();
  const cleanTitle = title.trim();
  const cleanSport = sport.trim();
  if (
    cleanTitle.length < 1 ||
    cleanTitle.length > 120 ||
    cleanSport.length < 1 ||
    cleanSport.length > 80
  ) {
    invalid();
  }
  return { title: cleanTitle, sport: cleanSport };
}
