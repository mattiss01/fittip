/**
 * Where a log's record was opened from (owner, 20 Oct 2026): a log on Today
 * or the Plan opens its record, and the record goes back there, through
 * Edit log and back again. Read from the query only as these two shapes.
 */
export type RecordOrigin = { from: "today" | "plan"; date: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function recordHref(
  completionId: string,
  origin: RecordOrigin | null = null,
) {
  return `/home/progress/${completionId}${originQuery(origin, "?")}`;
}

/** The origin carried on, as `from`/`date` or, beside another `from`, `via`. */
export function originQuery(
  origin: RecordOrigin | null,
  lead: "?" | "&",
  key: "from" | "via" = "from",
) {
  return origin === null
    ? ""
    : `${lead}${key}=${origin.from}&date=${origin.date}`;
}

export function readRecordOrigin(
  from: string | string[] | undefined,
  date: string | string[] | undefined,
): RecordOrigin | null {
  if (from !== "today" && from !== "plan") return null;
  if (typeof date !== "string" || !ISO_DATE.test(date)) return null;
  return { from, date };
}
