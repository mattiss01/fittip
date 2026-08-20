import { shiftIsoDate } from "@/lib/date/local-date";

export type SeriesRuleShape = {
  frequency: "daily" | "weekly";
  intervalCount: number;
  weekdays?: number[];
  startDate: string;
  endDate?: string;
};

type CoverageSeries = SeriesRuleShape & { id: string };

type CoverageSession = {
  localDate: string;
  status: "active" | "cancelled";
  seriesId: string | null;
  occurrenceDate: string | null;
};

/**
 * Expands one recurrence with calendar-date arithmetic only. The caller names
 * both bounds, so an open-ended rule is still finite and safe to preview.
 */
export function seriesOccurrenceDates(
  rule: SeriesRuleShape,
  fromDate: string,
  toDate: string,
  limit = Number.MAX_SAFE_INTEGER,
): string[] {
  if (limit < 1 || toDate < fromDate) return [];
  const start = rule.startDate > fromDate ? rule.startDate : fromDate;
  const end =
    rule.endDate !== undefined && rule.endDate < toDate ? rule.endDate : toDate;
  const dates: string[] = [];

  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) {
    if (rule.frequency === "daily") {
      if (daysBetween(rule.startDate, date) % rule.intervalCount === 0) {
        dates.push(date);
      }
    } else {
      const elapsedWeeks =
        daysBetween(weekStart(rule.startDate), weekStart(date)) / 7;
      if (
        (rule.weekdays ?? []).includes(weekday(date)) &&
        elapsedWeeks % rule.intervalCount === 0
      ) {
        dates.push(date);
      }
    }
    if (dates.length >= limit) break;
  }

  return dates;
}

/**
 * Dates for which a Plan visit has an occurrence it can still materialize.
 * A date already at the ten-session cap is not called incomplete: the write
 * cannot fill it, and the creation receipt is where that skipped date is
 * named. Counts are used only to decide whether work exists, never forecast to
 * the owner before an operation.
 */
export function findUncoveredSeriesDates(
  series: CoverageSeries[],
  sessions: CoverageSession[],
  fromDate: string,
  toDate: string,
): string[] {
  const covered = new Set(
    sessions.flatMap((session) =>
      session.seriesId !== null && session.occurrenceDate !== null
        ? [`${session.seriesId}|${session.occurrenceDate}`]
        : [],
    ),
  );
  const activeCounts = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== "active") continue;
    activeCounts.set(
      session.localDate,
      (activeCounts.get(session.localDate) ?? 0) + 1,
    );
  }

  const uncovered = new Set<string>();
  for (const segment of series) {
    for (const occurrenceDate of seriesOccurrenceDates(
      segment,
      fromDate,
      toDate,
    )) {
      if (covered.has(`${segment.id}|${occurrenceDate}`)) continue;
      const count = activeCounts.get(occurrenceDate) ?? 0;
      if (count >= 10) continue;
      uncovered.add(occurrenceDate);
      // Mirror the materializer's per-date cap so a second missing series on
      // the same nearly-full date is not presented as fillable too.
      activeCounts.set(occurrenceDate, count + 1);
    }
  }
  return [...uncovered].toSorted();
}

function daysBetween(fromDate: string, toDate: string) {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00.000Z`) -
      Date.parse(`${fromDate}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
}

function weekStart(isoDate: string) {
  return shiftIsoDate(isoDate, -weekday(isoDate));
}
