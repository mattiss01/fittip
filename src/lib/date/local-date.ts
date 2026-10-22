export function isoDateInTimezone(date: Date, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value }) => [type, value]),
  );

  if (!values.year || !values.month || !values.day) {
    throw new Error("The local date could not be derived.");
  }
  return `${values.year}-${values.month}-${values.day}`;
}

/** A `YYYY-MM-DD` date the calendar has: not the 30th of February. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * How far ahead of today a plan or a roadmap may start (owner, 9 Oct 2026).
 * Further out the coach would plan from training that has not happened yet.
 */
export const COACH_START_MAX_DAYS_AHEAD = 30;

/**
 * Steps a calendar date, not an instant. Planning counts days on the owner's
 * calendar, where a daylight-saving change does not add or remove one, so this
 * deliberately does the arithmetic in UTC rather than in any zone.
 */
export function shiftIsoDate(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(shifted.valueOf())) {
    throw new Error("The local date could not be shifted.");
  }
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The wall-clock time an instant shows in a zone, `HH:MM` on a 24-hour clock:
 * when a log says it started, in the zone it was written in.
 */
export function localTimeInTimezone(date: Date, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezoneName,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find(({ type }) => type === "hour")?.value;
  const minute = parts.find(({ type }) => type === "minute")?.value;
  if (!hour || !minute) throw new Error("The local time could not be derived.");
  return `${hour}:${minute}`;
}

/**
 * The instant a wall-clock time on a calendar date names in a zone: a log's
 * date and "Started at" as the database stores them. The zone's offset is
 * read at that moment, so a date across a daylight-saving change is right. A
 * time the clocks skipped (02:30 on a spring-forward night) lands an hour
 * later, as a clock that sprang forward would show it.
 */
export function instantInTimezone(
  isoDate: string,
  time: string,
  timezoneName: string,
): Date {
  const wall = Date.parse(`${isoDate}T${time}:00.000Z`);
  if (!Number.isFinite(wall)) throw new Error("The local time is not valid.");
  // Two passes: the offset at the first guess, then at the corrected instant.
  let instant = wall - offsetMs(new Date(wall), timezoneName);
  instant = wall - offsetMs(new Date(instant), timezoneName);
  return new Date(instant);
}

/** How far the zone's wall clock is ahead of UTC at an instant. */
function offsetMs(date: Date, timezoneName: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
