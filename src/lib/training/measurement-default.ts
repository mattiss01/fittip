import type { TrainingMeasurementMode } from "./measurement";

/**
 * How the owner last measured an activity of each sport, keyed by
 * `measurementSportKey`. Read from their own logs and plan (owner,
 * 16 Oct 2026: "from your history", not a table of what each sport usually
 * is), so it is personal and says nothing about a sport they have never done.
 */
export type ModeBySport = Readonly<Record<string, TrainingMeasurementMode>>;

/** One activity the owner wrote, newest first in the lists below. */
export type MeasuredActivity = {
  sport: string;
  measurementMode: TrainingMeasurementMode;
};

/** Case and surrounding space do not make "Running" and "running " two sports. */
export function measurementSportKey(sport: string): string {
  return sport.trim().toLocaleLowerCase("en");
}

/**
 * The newest mode per sport. "Not measured" is passed over: a warm-up listed
 * by name is the usual one, and starting the next running row unmeasured
 * because of it would be the opposite of help.
 */
export function latestModeBySport(
  newestFirst: readonly MeasuredActivity[],
): ModeBySport {
  const modes: Record<string, TrainingMeasurementMode> = {};
  for (const activity of newestFirst) {
    if (activity.measurementMode === "unmeasured") continue;
    const key = measurementSportKey(activity.sport);
    if (key === "" || key in modes) continue;
    modes[key] = activity.measurementMode;
  }
  return modes;
}

/**
 * What an added row is measured as: how this sport was last measured, else
 * like the row above it, else not measured. Only a starting point; the field
 * stays the owner's to change.
 */
export function startingMode(
  sport: string,
  history: ModeBySport,
  above: TrainingMeasurementMode | null,
): TrainingMeasurementMode {
  return history[measurementSportKey(sport)] ?? above ?? "unmeasured";
}
