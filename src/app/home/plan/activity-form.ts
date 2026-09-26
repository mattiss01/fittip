import "server-only";

import {
  parseSubmittedActivities,
  RollingPlanValidationError,
  type RollingPlanActivityInput,
  type RollingPlanSeriesActivityInput,
} from "@/server/rolling-plan/rolling-plan";

/**
 * A session's activities, as `ActivityEditor` serialized them.
 *
 * One JSON field rather than indexed names, because the list is reorderable —
 * `ActivityEditor` explains that end of it. This function owns only what is
 * true of a *form value*: that it is a string, and that it is JSON. What the
 * decoded value has to be is the rolling plan's question, and
 * `parseSubmittedActivities` answers it behind the same seam that owns the
 * contract — which is also why no route file reaches the measurement
 * validator directly.
 *
 * A missing field throws rather than reading as an empty list. On an edit the
 * list submitted is the list kept, so "no field" and "no activities" must not
 * be the same answer: the first is a broken form and the second is a session
 * the owner emptied on purpose.
 */
export function readSubmittedActivities(
  formData: FormData,
): RollingPlanActivityInput[] {
  const raw = formData.get("activities");
  if (typeof raw !== "string") throw new RollingPlanValidationError();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new RollingPlanValidationError();
  }
  return parseSubmittedActivities(decoded);
}

/**
 * The same list for a template — a series or a library entry — which carries
 * no Plan lock, because a lock belongs to a dated session.
 */
export function readSubmittedTemplateActivities(
  formData: FormData,
): RollingPlanSeriesActivityInput[] {
  return readSubmittedActivities(formData).map(({ isLocked, ...activity }) => {
    void isLocked;
    return activity;
  });
}
