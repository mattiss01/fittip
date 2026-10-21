// Shorthand the athlete files are written in. Every date is an offset in days
// from the athlete's own today, so the data reads as current whenever the
// script runs.

/** `YYYY-MM-DD` of today in an IANA zone. */
export function todayIn(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 is Sunday through 6 is Saturday, as Postgres and the plan number them. */
export function weekdayOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export const SUN = 0;
export const MON = 1;
export const TUE = 2;
export const WED = 3;
export const THU = 4;
export const FRI = 5;
export const SAT = 6;

/** "5:30" → 330 seconds. */
function seconds(pace) {
  const [minutes, rest] = pace.split(":").map(Number);
  return minutes * 60 + rest;
}

// Measurements, in the shapes `is_valid_training_measurement` accepts.

export function run({ min, dist, unit = "km", pace }) {
  const value = {};
  if (min !== undefined) value.duration_seconds = Math.round(min * 60);
  if (dist !== undefined) {
    value.distance = dist;
    value.distance_unit = unit;
  }
  if (pace !== undefined) {
    value.pace_seconds_per_unit = seconds(pace);
    value.pace_unit = {
      km: "sec/km",
      mi: "sec/mi",
      m: "sec/100m",
      yd: "sec/100yd",
    }[unit];
  }
  return value;
}

export function lift(sets, reps, load, unit = "kg") {
  return load === undefined
    ? { sets, reps }
    : { sets, reps, load, load_unit: unit };
}

/** Grouped sets, e.g. a ramp: `[[1, 5, 60], [3, 3, 80]]`. */
export function ramp(groups, unit = "kg") {
  return {
    groups: groups.map(([sets, reps, load]) =>
      load === undefined ? { sets, reps } : { sets, reps, load },
    ),
    load_unit: unit,
  };
}

export function effort(minutes, intensity, perceived) {
  const value = { duration_minutes: minutes };
  if (intensity) value.intensity = intensity;
  if (perceived) value.perceived_effort = perceived;
  return value;
}

/** A count of anything, as one set of reps: `count(25)` boulders. */
export function count(reps) {
  return { groups: [{ sets: 1, reps }] };
}

/** Sets held for a time, e.g. a plank: `timed(3, 45)`. */
export function timed(sets, seconds, load, unit = "kg") {
  return load === undefined
    ? { groups: [{ sets, seconds }] }
    : { groups: [{ sets, seconds, load }], load_unit: unit };
}

/** Interval blocks: `[[6, { dist: 400, rest: 90 }], [3, { sec: 720 }]]`. */
export function intervals(blocks, unit = "m") {
  const value = {
    blocks: blocks.map(([repeats, { dist, sec, rest }]) => ({
      repeats,
      ...(dist === undefined ? {} : { distance: dist }),
      ...(sec === undefined ? {} : { seconds: sec }),
      ...(rest === undefined ? {} : { rest_seconds: rest }),
    })),
  };
  if (value.blocks.some((block) => block.distance !== undefined)) {
    value.distance_unit = unit;
  }
  return value;
}

const MODES = {
  run: "time_distance_pace",
  lift: "sets_reps_load",
  effort: "duration_intensity",
  intervals: "intervals",
  none: "unmeasured",
};

/**
 * One activity in a session, series, saved session or log. `lib` names an
 * entry of the athlete's library by its key; `value` is the target when
 * planned and the actual when logged.
 */
export function act(name, sport, kind, value, extra = {}) {
  return {
    name,
    sport,
    measurementMode: MODES[kind],
    value: kind === "none" ? undefined : value,
    ...extra,
  };
}

// SQL literals for the few rows written directly (see seed.mjs).

export function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") return `${sql(JSON.stringify(value))}::jsonb`;
  return `'${String(value).replaceAll("'", "''")}'`;
}
