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
