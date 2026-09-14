/**
 * One planned target, in the words the owner would use for it.
 *
 * The value comes from a completion's stored `plannedSnapshot`, so it is what
 * the plan said when the training was logged and not what the plan says now.
 * Only the planned side is described: there is no capture path for an actual
 * per-activity measurement yet, and M3-15C does not add one.
 *
 * The measurement type is imported for its shape only. `import type` is erased,
 * so nothing here pulls the `server-only` module it is declared in.
 */
import type { TrainingMeasurement } from "@/server/training/training-measurements";

const INTENSITY_LABELS = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  very_hard: "Very hard",
} as const;

const PACE_LABELS = {
  "sec/km": "/km",
  "sec/mi": "/mi",
  "sec/100m": "/100 m",
  "sec/100yd": "/100 yd",
} as const;

/**
 * `null` when the plan set no target for the activity, which is a fact about
 * the plan rather than a zero. The caller draws nothing in that case.
 */
export function describeTarget(
  target: TrainingMeasurement | null,
): string | null {
  if (target === null) return null;

  if ("sets" in target) {
    return join([
      `${target.sets} × ${target.reps}`,
      target.load === undefined
        ? null
        : `${formatNumber(target.load)} ${target.load_unit}`,
    ]);
  }

  if ("duration_minutes" in target) {
    return join([
      `${target.duration_minutes} min`,
      target.intensity === undefined
        ? null
        : INTENSITY_LABELS[target.intensity],
      target.perceived_effort === undefined
        ? null
        : `Effort ${target.perceived_effort} of 10`,
    ]);
  }

  if ("repetitions" in target) {
    return `${target.repetitions} ${target.unit}`;
  }

  if ("label" in target) {
    return join([`${target.label}: ${formatValue(target.value)}`, target.unit]);
  }

  return join([
    target.duration_seconds === undefined
      ? null
      : formatSeconds(target.duration_seconds),
    target.distance === undefined
      ? null
      : `${formatNumber(target.distance)} ${target.distance_unit}`,
    target.pace_seconds_per_unit === undefined || target.pace_unit === undefined
      ? null
      : `${formatSeconds(target.pace_seconds_per_unit)}${PACE_LABELS[target.pace_unit]}`,
  ]);
}

function join(parts: (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length === 0 ? null : kept.join(" · ");
}

/** A clock reading, not a count: `7:30` and `1:05:00` rather than seconds. */
function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const padded = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

/** Trailing zeros are noise on a plan the owner wrote in whole numbers. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value));
}

function formatValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "number" ? formatNumber(value) : value;
}
