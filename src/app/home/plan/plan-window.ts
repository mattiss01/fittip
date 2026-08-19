import "server-only";

import { PLAN_WINDOW_DAYS } from "./action-state";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import {
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";

/** Positions are 0-99; nothing sensible remains once a date is that deep. */
const MAX_POSITION = 99;

export type PlanWindow = { today: string; lastDate: string };

/**
 * The owner-local window every Plan write is bounded by. It is derived from
 * the stored zone, never from the request, so nothing a caller sends can move
 * it. An owner with no stored zone has no plan yet, so this refuses rather
 * than guessing a zone on their behalf.
 *
 * Shared by the Plan surface and by reuse from the library, which must land on
 * exactly the same dates the Plan offers.
 */
export async function readPlanWindow(): Promise<PlanWindow> {
  const profile = await (await createProfileRepository()).getCurrentProfile();
  if (!profile?.timezoneName) throw new RollingPlanTimezoneRequiredError();
  const today = isoDateInTimezone(new Date(), profile.timezoneName);
  return { today, lastDate: shiftIsoDate(today, PLAN_WINDOW_DAYS - 1) };
}

export function readPlannableDate(
  value: FormDataEntryValue | null,
  window: PlanWindow,
): string {
  if (
    typeof value !== "string" ||
    value < window.today ||
    value > window.lastDate
  ) {
    throw new RollingPlanValidationError();
  }
  return value;
}

/** The first free slot on the target date, so the owner never types a position. */
export function nextPlanPosition(
  slice: RollingPlanSlice,
  localDate: string,
): number {
  const taken = new Set(
    slice.sessions
      .filter(
        (session) =>
          session.localDate === localDate && session.status === "active",
      )
      .map((session) => session.position),
  );
  for (let position = 0; position <= MAX_POSITION; position += 1) {
    if (!taken.has(position)) return position;
  }
  throw new RollingPlanValidationError();
}
