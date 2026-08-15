import "server-only";

import { isResolvedTimezone } from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import { isoDateInTimezone } from "@/lib/date/local-date";

/**
 * The selected horizon: which owner-local calendar dates a plan request covers.
 *
 * The server owns every one of these dates. The model is told the range and is
 * checked against it afterwards; it cannot choose, extend, shorten, or silently
 * pad it, and neither can a planning note.
 *
 * ## Why the arithmetic is in UTC when the dates are local
 *
 * A calendar date sequence is not affected by daylight saving. Adding a day to
 * "2026-10-25" gives "2026-10-26" whether or not the clocks moved that night,
 * and the only thing DST changes is which instant the owner's day begins at.
 * So the timezone is used exactly once — to decide which calendar date "today"
 * is for this owner — and every date after that is produced by adding whole
 * days to a UTC midnight, which cannot land on 23:00 the previous day the way
 * local-time arithmetic can.
 */

export const PLAN_MIN_DAY_COUNT = 1;
export const PLAN_MAX_DAY_COUNT = 7;

/**
 * Decision 1: seven on first use, then the owner's last count. The default
 * lives here rather than in the surface so the server and the screen cannot
 * disagree about what an unremembered request means.
 */
export const PLAN_DEFAULT_DAY_COUNT = 7;

const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PlanHorizon = {
  startDate: string;
  endDate: string;
  dayCount: number;
  /** Every requested date, in order. A rest day is one of these with no session. */
  dates: string[];
};

/**
 * The owner's local calendar date, which is the only "today" a plan may start
 * on. Refuses rather than falling back to UTC: a silent fallback produces a
 * plan for the wrong days on exactly the evenings where it matters.
 */
export function resolveOwnerToday(
  timezoneName: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!isResolvedTimezone(timezoneName)) {
    throw new CoachAIError("context_invalid");
  }
  return isoDateInTimezone(now, timezoneName);
}

/**
 * Decision 2: a proposal starts on the owner's local today or later, never in
 * the past, so no proposal can cover a day that has already happened.
 *
 * Decision 1: the day count is remembered across requests and the start date is
 * not. That asymmetry is a surface behaviour, but the consequence is enforced
 * here — a remembered start date would arrive stale, and a stale start date is
 * the kind of error nobody notices until the plan covers the wrong week.
 */
export function derivePlanHorizon(input: {
  today: string;
  startDate: string;
  dayCount: number;
}): PlanHorizon {
  const { today, startDate, dayCount } = input;

  if (
    !Number.isSafeInteger(dayCount) ||
    dayCount < PLAN_MIN_DAY_COUNT ||
    dayCount > PLAN_MAX_DAY_COUNT
  ) {
    throw new CoachAIError("invalid_input");
  }

  const todayMs = parseIsoDate(today);
  const startMs = parseIsoDate(startDate);
  if (todayMs === null || startMs === null) {
    throw new CoachAIError("invalid_input");
  }
  if (startMs < todayMs) throw new CoachAIError("invalid_input");

  const dates: string[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    dates.push(toIsoDate(startMs + offset * DAY_MS));
  }

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dayCount,
    dates,
  };
}

/**
 * The horizon a stored request describes, rebuilt from its two dates.
 *
 * The validator needs the day count to know how many sessions are permitted,
 * and recomputing it from the dates rather than trusting a separate field is
 * what stops the two disagreeing.
 */
export function planDayCount(
  startDate: string,
  endDate: string,
): number | null {
  const startMs = parseIsoDate(startDate);
  const endMs = parseIsoDate(endDate);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / DAY_MS) + 1;
}

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  // Rejects a day that silently rolled over, such as 2026-04-31.
  return parsed.toISOString().slice(0, 10) === value ? time : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
