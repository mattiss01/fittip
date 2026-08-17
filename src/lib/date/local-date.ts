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
