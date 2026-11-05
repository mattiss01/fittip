/**
 * What Progress counts of one month (owner, 5 Nov 2026, P1). It counts the
 * owner's own logs and nothing else: no target, score, streak or trend, and
 * nothing it does not have. A skip and a replacement record no training, so
 * they are counted by outcome but not as sessions, and a log without a
 * duration is named rather than added as nothing.
 */
import { mondayOf } from "../plan/plan-weeks";
import {
  recordsTraining,
  type CompletionOutcome,
} from "../log/log-action-state";

type Countable = {
  outcome: CompletionOutcome;
  actualLocalDate: string;
  sport: string | null;
  durationMinutes: number | null;
};

export type RecordCount = {
  /** Logs that record training. */
  sessions: number;
  /** Their durations added up, where they have one. */
  minutes: number;
  /** Sessions with no duration, which `minutes` leaves out. */
  withoutDuration: number;
};

export function countRecord(entries: Countable[]): RecordCount {
  const trained = entries.filter((entry) => recordsTraining(entry.outcome));
  return {
    sessions: trained.length,
    minutes: trained.reduce(
      (sum, entry) => sum + (entry.durationMinutes ?? 0),
      0,
    ),
    withoutDuration: trained.filter((entry) => entry.durationMinutes === null)
      .length,
  };
}

/** Each outcome the entries hold, in the log form's order, with its count. */
export function countOutcomes(entries: Countable[]) {
  const order: CompletionOutcome[] = [
    "completed",
    "partially_completed",
    "replaced",
    "unplanned",
    "skipped",
  ];
  return order
    .map((outcome) => ({
      outcome,
      count: entries.filter((entry) => entry.outcome === outcome).length,
    }))
    .filter(({ count }) => count > 0);
}

/** Sessions per sport, in the order the sports are listed. */
export function sessionsBySport(entries: Countable[], sports: string[]) {
  return sports
    .map((sport) => ({
      sport,
      sessions: entries.filter(
        (entry) => entry.sport === sport && recordsTraining(entry.outcome),
      ).length,
    }))
    .filter(({ sessions }) => sessions > 0);
}

export type RecordWeek<T> = { monday: string; entries: T[] };

/**
 * The entries arrive most recent first and stay in that order; this only puts
 * the ones in the same Monday-to-Sunday week under one heading.
 */
export function groupByWeek<T extends { actualLocalDate: string }>(
  entries: T[],
): RecordWeek<T>[] {
  const weeks: RecordWeek<T>[] = [];
  for (const entry of entries) {
    const monday = mondayOf(entry.actualLocalDate);
    const last = weeks.at(-1);
    if (last?.monday === monday) {
      last.entries.push(entry);
    } else {
      weeks.push({ monday, entries: [entry] });
    }
  }
  return weeks;
}

/** "3 h 58", "45 min", "2 h": how long, never a decimal of hours. */
export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}
