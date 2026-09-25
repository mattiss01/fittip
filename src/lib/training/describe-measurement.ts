/**
 * One measurement, in the words the owner would use for it.
 *
 * Moved here from `src/app/home/progress/planned-target.ts`, which is now a
 * re-export: the plan's activity editor needs the same words for its preview
 * and Today needs them to print a target, and neither may import from a
 * progress screen. The type comes from `@/lib/training/measurement` so that a
 * Client Component can call this at all.
 *
 * It describes a target and an actual alike. They are the same five shapes —
 * what the plan asked for and what the owner did are only distinguished by
 * which column they were read from.
 */
import type {
  LoadUnit,
  SetGroup,
  TrainingMeasurement,
} from "@/lib/training/measurement";

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
export function describeMeasurement(
  target: TrainingMeasurement | null,
): string | null {
  if (target === null) return null;

  // Both `sets_reps_load` shapes go through one renderer, so the same
  // prescription never reads two ways depending on which shape it was stored
  // in. A single group renders exactly as the flat form always has — `5 × 5 ·
  // 82.5 kg` — which is why the flat branch is a one-group call rather than a
  // second piece of formatting to keep in step.
  if ("groups" in target) {
    return describeGroups(target.groups, target.load_unit);
  }

  if ("sets" in target) {
    return describeGroups(
      [
        {
          sets: target.sets,
          reps: target.reps,
          ...(target.load === undefined ? {} : { load: target.load }),
        },
      ],
      target.load_unit,
    );
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

/**
 * Set groups, in the words a training log uses. Groups are joined with `+`
 * rather than the `·` that separates a group's own parts, so `3 × 5 · 60 kg +
 * 1 × 3 · 100 kg` reads as two blocks and not as one list of four things.
 */
function describeGroups(
  groups: SetGroup[],
  loadUnit: LoadUnit | undefined,
): string | null {
  const described = groups
    .map((group) =>
      join([
        group.sets !== undefined && group.reps !== undefined
          ? `${group.sets} × ${group.reps}`
          : group.sets !== undefined
            ? `${group.sets} ${group.sets === 1 ? "set" : "sets"}`
            : group.reps !== undefined
              ? `${group.reps} ${group.reps === 1 ? "rep" : "reps"}`
              : null,
        group.load === undefined
          ? null
          : `${formatNumber(group.load)}${loadUnit === undefined ? "" : ` ${loadUnit}`}`,
      ]),
    )
    .filter((part): part is string => part !== null);
  return described.length === 0 ? null : described.join(" + ");
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
