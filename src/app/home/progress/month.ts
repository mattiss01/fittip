/**
 * The calendar month Progress pages by. M3-15A observation 3 asked for the
 * page bound to be chosen deliberately: `CompletionLog.list` enforces no
 * maximum width, and Progress is its first paginating caller, so the bound is
 * a month of the owner's own calendar rather than a row count. A month is
 * addressable in the URL, so the back button steps through the months the
 * owner actually visited.
 *
 * Every function here is calendar arithmetic in UTC. A month is a label on a
 * calendar, not an interval on a clock, so a daylight-saving change must not
 * move it; the owner's zone decides only which month is the current one, and
 * that decision is made by the caller.
 */
import { shiftIsoDate } from "@/lib/date/local-date";

/** Both ends inclusive, in the form `CompletionLog.list` takes. */
export type MonthWindow = { startDate: string; endDate: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Outside this range a `YYYY-MM` string is a typo rather than a month someone
 * trained in, and year arithmetic below four digits stops round-tripping
 * through `toISOString`. Refusing it here means the fallback to the owner's
 * current month happens before any read.
 */
const EARLIEST_MONTH = "1900-01";
const LATEST_MONTH = "2999-12";

const MONTH_NAME = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A month the owner asked for, or nothing. Nothing is not an error: the caller
 * falls back to the owner-local current month, so a mistyped or stale link
 * still opens a real month rather than a blank one.
 */
export function readRequestedMonth(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string" || !MONTH.test(value)) return null;
  return value >= EARLIEST_MONTH && value <= LATEST_MONTH ? value : null;
}

/** The month an owner-local `YYYY-MM-DD` date falls in. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function shiftMonth(month: string, months: number): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf())) {
    throw new Error("The month could not be shifted.");
  }
  // Always the first of the month, so no shift can overflow into the next one.
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

export function monthWindow(month: string): MonthWindow {
  return {
    startDate: `${month}-01`,
    endDate: shiftIsoDate(`${shiftMonth(month, 1)}-01`, -1),
  };
}

export function formatMonth(month: string): string {
  return MONTH_NAME.format(new Date(`${month}-01T00:00:00.000Z`));
}
