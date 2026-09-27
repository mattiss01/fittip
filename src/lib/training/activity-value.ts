import type {
  TrainingMeasurement,
  TrainingMeasurementMode,
} from "@/lib/training/measurement";

/**
 * One activity as a session editor holds it.
 *
 * It lives here rather than beside `ActivityEditor` so that a Server
 * Component can call `toActivityValue`: a function exported from a
 * `"use client"` module reaches the server as a client reference, not as
 * something it can run.
 */
export type ActivityValue = {
  /**
   * The library definition this row was copied from, or null. Every editor
   * submits it back unchanged, because an edit replaces the whole list and a
   * row that dropped it would lose the link for good (A5). Changing the row's
   * fields keeps it: the link says where the row came from, not that the two
   * still agree.
   */
  personalActivityId: string | null;
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
};

/**
 * A planned or saved activity, as its domain module reads it, projected into
 * what an editor holds. The one place that projection is written: when each
 * page wrote its own, the proposal page's version dropped the whole list, and
 * a field added to `ActivityValue` had to be remembered in every copy.
 */
export function toActivityValue(activity: {
  personalActivityId?: string | null;
  name: string;
  sport: string;
  instructions?: string | null;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement | null;
}): ActivityValue {
  return {
    personalActivityId: activity.personalActivityId ?? null,
    name: activity.name,
    sport: activity.sport,
    instructions: activity.instructions ?? null,
    measurementMode: activity.measurementMode,
    target: activity.target ?? null,
  };
}
