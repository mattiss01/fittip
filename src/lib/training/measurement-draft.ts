/**
 * The strings a form holds, and how they become a measurement.
 *
 * A form input is always a string, and `TrainingMeasurement` is six different
 * shapes of number, union and unit. Something has to sit between them, and
 * this is it: a draft the editor can bind inputs to, plus one function that
 * turns it into a measurement or says why it cannot.
 *
 * **This is not validation.** `parseTrainingMeasurement` on the server decides
 * what is real, and it runs on every write whatever this module concluded,
 * mirroring `is_valid_training_measurement` in the database, which is the
 * authority. What this adds is a *message*: the server's refusal is one
 * `TrainingMeasurementValidationError` for every mode, which on a form means
 * "something in this row is wrong" and nothing more. Here we know that a load
 * was given with no unit, so the owner can be told that instead. Where the two
 * disagree the server wins and the owner sees a generic error, which is a bug
 * in this file, not in that one.
 *
 * Two shapes deserve their own note.
 *
 * **Set groups.** `sets_reps_load` holds a list of groups rather than one
 * uniform prescription, so a squat that ramps is one activity. A group carries
 * its own count, which is what makes the uniform case simply the one-group
 * case — no toggle tells them apart. The draft therefore has a list beside its
 * flat fields, rather than encoding groups into indexed key names, because an
 * editor that adds and removes rows would otherwise have to renumber keys.
 *
 * **Times.** `duration_seconds` and `pace_seconds_per_unit` are stored as
 * seconds, and nobody writing a plan thinks in seconds past about ninety of
 * them. The draft holds `7:30`, and `readClock` turns it into 450.
 */

import {
  type DistanceUnit,
  type IntervalBlock,
  type PaceUnit,
  type SetGroup,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";

/**
 * One set-group row as the form holds it. A set is counted in reps or held
 * for a time (ADR-038): `by` says which, and only that one is built. The time
 * reads as a clock, `0:45` or a bare `45`.
 */
export type SetGroupDraft = {
  sets: string;
  reps: string;
  time: string;
  load: string;
  by: "reps" | "time";
};

/** One interval block as the form holds it; times read as clocks. */
export type IntervalBlockDraft = {
  repeats: string;
  distance: string;
  time: string;
  rest: string;
};

export type MeasurementDraft = {
  /** The flat fields, for the modes that have them. */
  fields: Record<string, string>;
  /** `sets_reps_load` only, in the order the editor draws them. */
  groups: SetGroupDraft[];
  /** `intervals` only, in order. Absent wherever the mode is not intervals. */
  blocks?: IntervalBlockDraft[];
};

export type MeasurementBuild =
  | { ok: true; measurement: TrainingMeasurement | null }
  | { ok: false; message: string };

/** The flat fields each mode binds, in the order the editor draws them. */
export const MEASUREMENT_FIELDS: Record<TrainingMeasurementMode, string[]> = {
  unmeasured: [],
  sets_reps_load: ["load_unit"],
  time_distance_pace: [
    "duration",
    "distance",
    "distance_unit",
    "pace",
    "pace_unit",
  ],
  duration_intensity: ["duration_minutes", "intensity"],
  intervals: ["distance_unit"],
};

export const emptySetGroup = (
  by: SetGroupDraft["by"] = "reps",
): SetGroupDraft => ({
  sets: "",
  reps: "",
  time: "",
  load: "",
  by,
});

export const emptyIntervalBlock = (): IntervalBlockDraft => ({
  repeats: "",
  distance: "",
  time: "",
  rest: "",
});

export function emptyDraft(mode: TrainingMeasurementMode): MeasurementDraft {
  const fields: Record<string, string> = {};
  for (const field of MEASUREMENT_FIELDS[mode]) fields[field] = "";
  // The unit selects default to something rather than to a blank option: a
  // load of 60 with no unit is refused by the server, and "60 what?" is not a
  // question the owner should be asked when kg is right nine times in ten.
  if (mode === "sets_reps_load") fields.load_unit = "kg";
  if (mode === "time_distance_pace") {
    fields.distance_unit = "km";
    fields.pace_unit = "sec/km";
  }
  // Intervals are most often track or pool repeats, measured in metres.
  if (mode === "intervals") fields.distance_unit = "m";
  return {
    fields,
    groups: mode === "sets_reps_load" ? [emptySetGroup()] : [],
    ...(mode === "intervals" ? { blocks: [emptyIntervalBlock()] } : {}),
  };
}

/** The reverse, for editing a row that already has a target. */
export function draftFromMeasurement(
  mode: TrainingMeasurementMode,
  measurement: TrainingMeasurement | null,
): MeasurementDraft {
  const draft = emptyDraft(mode);
  if (measurement === null) return draft;
  const { fields } = draft;

  if ("groups" in measurement) {
    draft.groups = measurement.groups.map(groupToDraft);
    fields.load_unit = measurement.load_unit ?? "kg";
  } else if ("sets" in measurement) {
    // The flat shape nothing writes any more. It still has to come back as
    // something editable, because a measurement sealed into history can be
    // read into a form even though it was not written by one.
    draft.groups = [
      groupToDraft({
        sets: measurement.sets,
        reps: measurement.reps,
        ...(measurement.load === undefined ? {} : { load: measurement.load }),
      }),
    ];
    fields.load_unit = measurement.load_unit ?? "kg";
  } else if ("blocks" in measurement) {
    draft.blocks = measurement.blocks.map((block) => ({
      repeats: String(block.repeats),
      distance: block.distance === undefined ? "" : String(block.distance),
      time: block.seconds === undefined ? "" : writeClock(block.seconds),
      rest:
        block.rest_seconds === undefined ? "" : writeClock(block.rest_seconds),
    }));
    fields.distance_unit = measurement.distance_unit ?? "m";
  } else if ("duration_minutes" in measurement) {
    fields.duration_minutes = String(measurement.duration_minutes);
    fields.intensity = measurement.intensity ?? "";
  } else {
    if (measurement.duration_seconds !== undefined)
      fields.duration = writeClock(measurement.duration_seconds);
    if (measurement.distance !== undefined) {
      fields.distance = String(measurement.distance);
      fields.distance_unit = measurement.distance_unit ?? "km";
    }
    if (measurement.pace_seconds_per_unit !== undefined) {
      fields.pace = writeClock(measurement.pace_seconds_per_unit);
      fields.pace_unit = measurement.pace_unit ?? "sec/km";
    }
  }
  return draft;
}

function groupToDraft(group: SetGroup): SetGroupDraft {
  return {
    sets: group.sets === undefined ? "" : String(group.sets),
    reps: group.reps === undefined ? "" : String(group.reps),
    time: group.seconds === undefined ? "" : writeClock(group.seconds),
    load: group.load === undefined ? "" : String(group.load),
    by: group.seconds === undefined ? "reps" : "time",
  };
}

export function buildMeasurement(
  mode: TrainingMeasurementMode,
  draft: MeasurementDraft,
): MeasurementBuild {
  const { fields } = draft;

  // An activity with nothing to count has no target by definition, whatever
  // was left lying in the draft from a mode the owner tried first.
  if (mode === "unmeasured") return { ok: true, measurement: null };

  if (mode === "sets_reps_load") return buildSetGroups(draft);
  if (mode === "intervals") return buildIntervals(draft);

  // An untouched row is an activity with no target, which is legal everywhere
  // a target is. Only the fields that carry a value count: the unit selects
  // default to a choice, and a default nobody acted on is not an intention.
  const valued = MEASUREMENT_FIELDS[mode].filter(
    (field) => !field.endsWith("_unit") && (fields[field] ?? "").trim() !== "",
  );
  if (valued.length === 0) return { ok: true, measurement: null };

  switch (mode) {
    case "time_distance_pace": {
      const measurement: Extract<
        TrainingMeasurement,
        { duration_seconds?: number }
      > = {};
      if ((fields.duration ?? "").trim() !== "") {
        const seconds = readClock(fields.duration, 604800);
        if (seconds === null)
          return { ok: false, message: "Time reads as 7:30 or 1:05:00." };
        measurement.duration_seconds = seconds;
      }
      if ((fields.distance ?? "").trim() !== "") {
        const distance = readNumber(fields.distance, Number.MIN_VALUE, 1000000);
        if (distance === null)
          return { ok: false, message: "Distance is not a number." };
        measurement.distance = distance;
        measurement.distance_unit = readDistanceUnit(fields.distance_unit);
      }
      // Pace is arithmetic, not a third thing to be asked for: 20:00 over
      // 5 km is 4:00/km and nobody should type it twice. It is computed
      // whenever time and distance are both given, in the unit that matches
      // the distance, and only typed when one of the two is missing — a tempo
      // target of 4:45/km with no set distance is a real prescription.
      const derived = derivePace(
        measurement.duration_seconds,
        measurement.distance,
        measurement.distance_unit,
      );
      if (derived !== null) {
        measurement.pace_seconds_per_unit = derived.seconds;
        measurement.pace_unit = derived.unit;
      } else if ((fields.pace ?? "").trim() !== "") {
        const pace = readClock(fields.pace, 86400);
        if (pace === null) return { ok: false, message: "Pace reads as 4:45." };
        measurement.pace_seconds_per_unit = pace;
        measurement.pace_unit = readPaceUnit(fields.pace_unit);
      }
      return { ok: true, measurement };
    }

    case "duration_intensity": {
      // Minutes alone is a prescription. The owner dropped the effort field on
      // 25 September 2026 and asked that intensity not be mandatory either;
      // the stored shape still permits a `perceived_effort`, so a measurement
      // carrying one is still read and still described — this surface just
      // never writes one.
      const minutes = readNumber(
        fields.duration_minutes,
        Number.MIN_VALUE,
        10080,
      );
      if (minutes === null) {
        return { ok: false, message: "Minutes are needed for this mode." };
      }
      const intensity = readIntensity(fields.intensity);
      return {
        ok: true,
        measurement: {
          duration_minutes: minutes,
          ...(intensity === null ? {} : { intensity }),
        },
      };
    }

    default:
      return { ok: true, measurement: null };
  }
}

/**
 * Mirrors the grouped branch of `is_valid_training_measurement`.
 *
 * Empty group rows are dropped rather than refused. The editor always shows at
 * least one, so "no target" and "one blank row" are the same intention, and
 * refusing the blank would mean an activity could not be left unmeasured
 * without first deleting a row the form itself put there.
 */
function buildSetGroups(draft: MeasurementDraft): MeasurementBuild {
  const groups: SetGroup[] = [];
  let loaded = false;

  for (const row of draft.groups) {
    // Only the answer the row is set to counts: a row switched from reps to
    // time keeps what was typed, but does not send it (ADR-038).
    const repsText = row.by === "time" ? "" : row.reps.trim();
    const timeText = row.by === "time" ? row.time.trim() : "";
    const filled = [row.sets.trim(), repsText, timeText, row.load.trim()].some(
      (value) => value !== "",
    );
    if (!filled) continue;

    const sets = row.sets.trim() === "" ? null : readInteger(row.sets, 1, 100);
    const reps = repsText === "" ? null : readInteger(repsText, 1, 10000);
    const seconds = timeText === "" ? null : readWholeClock(timeText, 86400);
    const load =
      row.load.trim() === "" ? null : readNumber(row.load, 0, 100000);

    if (row.sets.trim() !== "" && sets === null) {
      return { ok: false, message: "Sets is a whole number from 1 to 100." };
    }
    if (repsText !== "" && reps === null) {
      return { ok: false, message: "Reps is a whole number." };
    }
    if (timeText !== "" && seconds === null) {
      return { ok: false, message: "A set's time reads as 45 or 1:30." };
    }
    if (row.load.trim() !== "" && load === null) {
      return { ok: false, message: "Load is not a number." };
    }

    if (load !== null) loaded = true;
    groups.push({
      ...(sets === null ? {} : { sets }),
      ...(reps === null ? {} : { reps }),
      ...(seconds === null ? {} : { seconds }),
      ...(load === null ? {} : { load }),
    });
  }

  if (groups.length === 0) return { ok: true, measurement: null };
  if (groups.length > 20) {
    return { ok: false, message: "Twenty set groups is the limit." };
  }
  // The unit belongs exactly when some group carries a load, which is the rule
  // the database applies; sending one without a load is refused there.
  if (!loaded) return { ok: true, measurement: { groups } };
  return {
    ok: true,
    measurement: {
      groups,
      load_unit: draft.fields.load_unit === "lb" ? "lb" : "kg",
    },
  };
}

/**
 * Mirrors the `intervals` branch of `is_valid_training_measurement`
 * (ADR-038). As with set groups, a blank block is dropped rather than refused:
 * the editor always shows one.
 */
function buildIntervals(draft: MeasurementDraft): MeasurementBuild {
  const blocks: IntervalBlock[] = [];
  let measured = false;

  for (const row of draft.blocks ?? []) {
    const repeatsText = row.repeats.trim();
    const distanceText = row.distance.trim();
    const timeText = row.time.trim();
    const restText = row.rest.trim();
    if (
      [repeatsText, distanceText, timeText, restText].every((v) => v === "")
    ) {
      continue;
    }

    const repeats = readInteger(repeatsText, 1, 100);
    if (repeats === null) {
      return { ok: false, message: "Repeats is a whole number from 1 to 100." };
    }
    const distance =
      distanceText === ""
        ? null
        : readNumber(distanceText, Number.MIN_VALUE, 1000000);
    if (distanceText !== "" && distance === null) {
      return { ok: false, message: "Distance is not a number." };
    }
    const seconds = timeText === "" ? null : readWholeClock(timeText, 86400);
    if (timeText !== "" && seconds === null) {
      return { ok: false, message: "A repeat's time reads as 90 or 1:30." };
    }
    if (distance === null && seconds === null) {
      return { ok: false, message: "Each block needs a distance or a time." };
    }
    // Rest may be none at all, so a typed 0 or 0:00 is kept as "no rest
    // between".
    const rest =
      restText === ""
        ? null
        : /^0+(:0+){0,2}$/.test(restText)
          ? 0
          : readWholeClock(restText, 3600);
    if (restText !== "" && rest === null) {
      return { ok: false, message: "Rest reads as 90 or 1:30, up to an hour." };
    }

    if (distance !== null) measured = true;
    blocks.push({
      repeats,
      ...(distance === null ? {} : { distance }),
      ...(seconds === null ? {} : { seconds }),
      ...(rest === null ? {} : { rest_seconds: rest }),
    });
  }

  if (blocks.length === 0) return { ok: true, measurement: null };
  if (blocks.length > 20) {
    return { ok: false, message: "Twenty interval blocks is the limit." };
  }
  if (!measured) return { ok: true, measurement: { blocks } };
  return {
    ok: true,
    measurement: {
      blocks,
      distance_unit: readDistanceUnit(draft.fields.distance_unit),
    },
  };
}

/** A clock read to whole seconds, as the database stores a set or a repeat. */
function readWholeClock(value: string, max: number): number | null {
  const seconds = readClock(value, max);
  return seconds === null || !Number.isInteger(seconds) || seconds < 1
    ? null
    : seconds;
}

/**
 * Seconds per distance unit, in the pace unit that matches the distance the
 * owner gave. Metres and yards pace per hundred, which is how swimming reads;
 * kilometres and miles pace per one, which is how running does.
 *
 * `null` when either side is missing or the distance is zero, which is the
 * caller's signal to use a typed pace instead.
 */
export function derivePace(
  durationSeconds: number | undefined,
  distance: number | undefined,
  distanceUnit: DistanceUnit | undefined,
): { seconds: number; unit: PaceUnit } | null {
  if (
    durationSeconds === undefined ||
    distance === undefined ||
    distanceUnit === undefined ||
    distance <= 0
  ) {
    return null;
  }
  const per100 = distanceUnit === "m" || distanceUnit === "yd";
  const seconds = Math.round(
    per100 ? (durationSeconds / distance) * 100 : durationSeconds / distance,
  );
  if (seconds < 1 || seconds > 86400) return null;
  const unit: PaceUnit =
    distanceUnit === "m"
      ? "sec/100m"
      : distanceUnit === "yd"
        ? "sec/100yd"
        : distanceUnit === "mi"
          ? "sec/mi"
          : "sec/km";
  return { seconds, unit };
}

/** `7:30` and `1:05:00` and a bare `450`, all to seconds. */
function readClock(value: string | undefined, max: number): number | null {
  const text = (value ?? "").trim();
  if (text === "") return null;
  const parts = text.split(":");
  if (parts.length > 3) return null;
  if (parts.length === 1) {
    return readNumber(parts[0], Number.MIN_VALUE, max);
  }
  let total = 0;
  for (const [index, part] of parts.entries()) {
    // Only the first part may be a bare digit: 7:5 is not 7:05, and reading it
    // as though it were would quietly change what the owner wrote.
    if (!/^\d+$/.test(part)) return null;
    if (index > 0 && part.length !== 2) return null;
    const unit = Number(part);
    if (index > 0 && unit > 59) return null;
    total = total * 60 + unit;
  }
  return total > 0 && total <= max ? total : null;
}

export function writeClock(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const padded = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

function readNumber(
  value: string | undefined,
  min: number,
  max: number,
): number | null {
  const text = (value ?? "").trim();
  if (text === "" || !/^-?\d*\.?\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readInteger(
  value: string | undefined,
  min: number,
  max: number,
): number | null {
  const parsed = readNumber(value, min, max);
  return parsed === null || !Number.isInteger(parsed) ? null : parsed;
}

function readIntensity(value: string | undefined) {
  const text = (value ?? "").trim();
  return text === "easy" ||
    text === "moderate" ||
    text === "hard" ||
    text === "very_hard"
    ? text
    : null;
}

function readDistanceUnit(value: string | undefined) {
  const text = (value ?? "").trim();
  return text === "m" || text === "mi" || text === "yd" ? text : "km";
}

function readPaceUnit(value: string | undefined) {
  const text = (value ?? "").trim();
  return text === "sec/mi" || text === "sec/100m" || text === "sec/100yd"
    ? text
    : "sec/km";
}
