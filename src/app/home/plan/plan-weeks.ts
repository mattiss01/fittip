import { PLAN_HISTORY_WEEKS } from "./action-state";

import { shiftIsoDate } from "@/lib/date/local-date";

/**
 * The Plan reads one week at a time (R3a, owner, 29 Sep 2026). Weeks run
 * Monday to Sunday and cover every date a session may be placed on, and a
 * quarter of weeks before this one: the first starts on the Monday on or
 * before `firstDate`, the last ends on the Sunday on or after the last
 * placeable date. Days before today are shown and never offer a "+"; the few
 * days past the last placeable date are shown as not open yet.
 *
 * R3b-3: recurring sessions are written through an earlier date than single
 * ones may be placed on, so a day can be open and still past the repeats.
 */
export type PlanWeekDay = {
  date: string;
  /** Before owner-local today: read-only. */
  past: boolean;
  /** Past the last placeable date: nothing is read or written there. */
  beyond: boolean;
  /** Past the date recurring sessions are written through. */
  afterRepeats: boolean;
};

export type PlanWeek = {
  /** The Monday. */
  start: string;
  /** The Sunday. */
  end: string;
  days: PlanWeekDay[];
};

export function mondayOf(isoDate: string): string {
  // 0 = Sunday. Noon UTC keeps the weekday clear of any offset.
  const weekday = new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
  return shiftIsoDate(isoDate, -((weekday + 6) % 7));
}

/** The Monday the Plan's earliest week starts on. */
export function planHistoryStart(today: string): string {
  return shiftIsoDate(mondayOf(today), -7 * PLAN_HISTORY_WEEKS);
}

export function planWeeks(
  today: string,
  lastPlaceableDate: string,
  repeatsThrough: string,
  /** A date in the earliest week to show; this week when there is no history. */
  firstDate: string = today,
): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (
    let start = mondayOf(firstDate);
    start <= lastPlaceableDate;
    start = shiftIsoDate(start, 7)
  ) {
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = shiftIsoDate(start, offset);
      return {
        date,
        past: date < today,
        beyond: date > lastPlaceableDate,
        afterRepeats: date > repeatsThrough,
      };
    });
    weeks.push({ start, end: days[6].date, days });
  }
  return weeks;
}

/** The week holding `date`, or `fallback` when it is in none. */
export function weekIndexOf(
  weeks: PlanWeek[],
  date: string | null,
  fallback = 0,
): number {
  if (date === null) return fallback;
  const index = weeks.findIndex(
    (week) => week.start <= date && date <= week.end,
  );
  return index === -1 ? fallback : index;
}

/** "45 min", "2 h", "2 h 30". */
export function formatPlannedTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/**
 * How busy a day looks on a week tile: 0 for nothing, then one step per
 * half hour planned, capped at 3. A session with no duration still counts
 * as one step, so a planned day never reads as empty.
 */
export function dayLoad(durations: (number | null)[]): 0 | 1 | 2 | 3 {
  if (durations.length === 0) return 0;
  const minutes = durations.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  return Math.min(3, Math.max(1, Math.ceil(minutes / 30))) as 1 | 2 | 3;
}

/**
 * A sport is the owner's own word, so its colour cannot come from a fixed
 * list, and a hash puts two of a handful of sports on one colour as often as
 * not. Instead the sports on the loaded plan are put in alphabetical order,
 * ignoring case and surrounding space, and take the six tones in turn: up to
 * six sports never share one, and a sport keeps its colour until a new sport
 * sorts in ahead of it.
 */
export const SPORT_TONES = 6;

export function sportKey(sport: string): string {
  return sport.trim().toLocaleLowerCase("en");
}

export function sportTones(sports: readonly string[]): Map<string, number> {
  const keys = [...new Set(sports.map(sportKey))].sort();
  return new Map(keys.map((key, index) => [key, index % SPORT_TONES]));
}

/** A roadmap phase as far as the Plan shows it. */
export type PlanPhase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
};

/**
 * The phase a week sits in: the one holding its Thursday, which is the day
 * that decides which week a date-range belongs to, else the first one that
 * touches the week at all.
 */
export function phaseOfWeek(
  phases: readonly PlanPhase[],
  week: Pick<PlanWeek, "start" | "end">,
): PlanPhase | null {
  const thursday = shiftIsoDate(week.start, 3);
  return (
    phases.find(
      (phase) => phase.startDate <= thursday && thursday <= phase.endDate,
    ) ??
    phases.find(
      (phase) => phase.startDate <= week.end && week.start <= phase.endDate,
    ) ??
    null
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/*
 * Dates are spelled by hand rather than through Intl: the server's and the
 * browser's ICU data disagree ("Mon 28 Sept" against "Mon, 28 Sept"), and a
 * client component rendered on both then fails hydration.
 */

/** "Wed". */
export function weekdayLabel(isoDate: string): string {
  return WEEKDAYS[new Date(`${isoDate}T12:00:00.000Z`).getUTCDay()];
}

/** "30 Sep". */
export function shortDateLabel(isoDate: string): string {
  return `${Number(isoDate.slice(8, 10))} ${MONTHS[Number(isoDate.slice(5, 7)) - 1]}`;
}

/** "Wed 30 Sep". */
export function dayLabel(isoDate: string): string {
  return `${weekdayLabel(isoDate)} ${shortDateLabel(isoDate)}`;
}
