/**
 * Every word the measurement surfaces print, in the one module a Client
 * Component may import — the arrangement `PLAN_PROPOSAL_COPY` uses and for the
 * same reason.
 *
 * The mode labels are the owner's words, not the database's. `sets_reps_load`
 * is what the column stores; "Sets, reps and load" is what a person picking
 * one from a list needs to read. The hints below each say what the mode is
 * *for*, because the difference between "Duration and intensity" and "Time,
 * distance and pace" is not obvious from the names alone and picking the wrong
 * one means retyping the whole row.
 */

import type {
  DistanceUnit,
  Intensity,
  LoadUnit,
  PaceUnit,
  TrainingMeasurementMode,
} from "@/lib/training/measurement";

export const MEASUREMENT_MODE_COPY: Record<
  TrainingMeasurementMode,
  { label: string; hint: string }
> = {
  unmeasured: {
    label: "Nothing to count",
    hint: "A drill you just want on the list, with no numbers.",
  },
  sets_reps_load: {
    label: "Sets, reps and load",
    hint: "One line per block. Three of the same, then a heavier single.",
  },
  time_distance_pace: {
    label: "Time, distance and pace",
    hint: "Running, riding, swimming — any two of the three.",
  },
  duration_intensity: {
    label: "Duration and intensity",
    hint: "How long and how hard, with no distance to record.",
  },
  skill_repetitions: {
    label: "Repetitions",
    hint: "A count of something you name yourself.",
  },
  custom: {
    label: "Custom",
    hint: "Anything the other four do not fit.",
  },
};

export const INTENSITY_COPY: Record<Intensity, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  very_hard: "Very hard",
};

export const LOAD_UNIT_COPY: Record<LoadUnit, string> = {
  kg: "kg",
  lb: "lb",
};

export const DISTANCE_UNIT_COPY: Record<DistanceUnit, string> = {
  m: "m",
  km: "km",
  mi: "mi",
  yd: "yd",
};

export const PACE_UNIT_COPY: Record<PaceUnit, string> = {
  "sec/km": "per km",
  "sec/mi": "per mile",
  "sec/100m": "per 100 m",
  "sec/100yd": "per 100 yd",
};

export const ACTIVITY_COPY = {
  /**
   * The surface designs for ten a session, decided by the owner on 24 Sep
   * 2026. The contract's own bound is fifty and stays there; this is the point
   * at which the form stops offering to add another, not a second rule about
   * what a session may hold.
   */
  softLimit: 10,
  atLimit: "Ten activities is as many as this form builds.",
  empty: "No activities yet. The session is just a heading until you add one.",
  add: "Add activity",
  remove: "Remove",
  /** Read by a screen reader in place of the drag handle's picture. */
  reorderHint: "Drag to reorder, or use the arrow keys.",
  noTarget: "No target",
  sportHint: "Taken from the session. Change it if this one differs.",
  derivedPace: "Worked out from the time and the distance.",
  addGroup: "Add set group",
  removeGroup: "Remove set group",
  groupLimit: "Twenty set groups is the limit.",
} as const;
