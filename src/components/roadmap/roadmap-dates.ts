/**
 * The roadmap's dates as the rest of the app writes them (R3, 3 Oct 2026):
 * "3 Oct 2026" rather than "2026-10-03". A roadmap spans months and may cross
 * a year, so the year stays; a range names it once when both ends share it.
 *
 * The stored value is a calendar date with no zone, so it is formatted in UTC
 * to keep the day it names. Anything that does not parse is shown as stored.
 */
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parse(localDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function formatRoadmapDate(localDate: string): string {
  const date = parse(localDate);
  return date === null ? localDate : DAY_MONTH_YEAR.format(date);
}

export function formatRoadmapRange(startDate: string, endDate: string): string {
  const start = parse(startDate);
  const end = parse(endDate);
  if (start === null || end === null) return `${startDate} → ${endDate}`;
  const first =
    start.getUTCFullYear() === end.getUTCFullYear()
      ? DAY_MONTH.format(start)
      : DAY_MONTH_YEAR.format(start);
  return `${first} → ${DAY_MONTH_YEAR.format(end)}`;
}
