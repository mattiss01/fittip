const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A log's day as the log form and its delete question write it. */
export function dayLabel(localDate: string): string {
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  return Number.isFinite(parsed)
    ? DAY_LABEL.format(new Date(parsed))
    : localDate;
}
