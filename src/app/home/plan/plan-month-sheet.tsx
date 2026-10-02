"use client";

import { useEffect, useRef, useState } from "react";

import { SheetLayer } from "./plan-sheet";
import { dayLabel, mondayOf } from "./plan-weeks";
import w from "./plan-week.module.css";
import {
  formatMonth,
  monthOf,
  monthWindow,
  shiftMonth,
} from "../progress/month";

import { shiftIsoDate } from "@/lib/date/local-date";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A month at a time, for reaching a week that is far away (owner, 2 Oct 2026):
 * the week strip shows how full each week is, and this is the way to a race in
 * five months without stepping there. A day says only whether it holds a
 * session. Lock, recovery, cancelled and logged are the week's to show, so
 * there is one place that states them and nothing here to keep in step.
 *
 * Choosing a day shows its week and closes the sheet. It does not open the
 * day's "+".
 */
export function MonthSheet({
  today,
  firstDate,
  lastDate,
  shownWeekStart,
  sessionCounts,
  onPick,
  onClose,
}: {
  today: string;
  /** The first and last dates the Plan has a week for. */
  firstDate: string;
  lastDate: string;
  /** The Monday of the week the Plan is showing, which the grid marks. */
  shownWeekStart: string;
  /** How many sessions each date holds; a date without any is absent. */
  sessionCounts: ReadonlyMap<string, number>;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const firstMonth = monthOf(firstDate);
  const lastMonth = monthOf(lastDate);
  // Which month to open on. The week holding today opens on today's month:
  // on 2 October the week began on 28 September, and September is not where
  // the owner is (owner, 2 Oct 2026). Any other week opens on the month most
  // of it is in - its Thursday, as the Plan decides which phase a week has.
  const [month, setMonth] = useState(() =>
    monthOf(
      today >= shownWeekStart && today <= shiftIsoDate(shownWeekStart, 6)
        ? today
        : shiftIsoDate(shownWeekStart, 3),
    ),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const { startDate, endDate } = monthWindow(month);
  // Monday first, so the days before the 1st are blanks.
  const blanks = daysBetween(mondayOf(startDate), startDate);
  const days = Array.from(
    { length: daysBetween(startDate, endDate) + 1 },
    (_, offset) => shiftIsoDate(startDate, offset),
  );
  const shownWeekEnd = shiftIsoDate(shownWeekStart, 6);

  return (
    <SheetLayer view="month" labelledBy="plan-month-title" onClose={onClose}>
      <header className={w.sheetHead}>
        <span />
        <button type="button" className={w.sheetClose} onClick={onClose}>
          Close
        </button>
      </header>
      <div className={w.monthHead}>
        <MonthArrow
          label="Previous month"
          glyph="‹"
          target={month > firstMonth ? shiftMonth(month, -1) : null}
          onGo={setMonth}
        />
        <h2 id="plan-month-title" ref={titleRef} tabIndex={-1}>
          {formatMonth(month)}
        </h2>
        <MonthArrow
          label="Next month"
          glyph="›"
          target={month < lastMonth ? shiftMonth(month, 1) : null}
          onGo={setMonth}
        />
      </div>
      <ol className={w.monthGrid} data-plan-month={month}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <li key={`weekday-${index}`} className={w.monthWeekday} aria-hidden>
            {initial}
          </li>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden />
        ))}
        {days.map((date) => {
          const count = sessionCounts.get(date) ?? 0;
          const inShownWeek = date >= shownWeekStart && date <= shownWeekEnd;
          const number = Number(date.slice(8));
          // A date the Plan has no week for cannot be gone to, so it is a
          // number and not a button.
          if (date < firstDate || date > lastDate) {
            return (
              <li key={date} className={w.monthDay} data-out-of-plan>
                <span className={w.monthNumber}>{number}</span>
              </li>
            );
          }
          return (
            <li key={date} className={w.monthDay}>
              <button
                type="button"
                className={w.monthPick}
                data-month-date={date}
                data-today={date === today || undefined}
                data-shown-week={inShownWeek || undefined}
                aria-label={`${dayLabel(date)}${date === today ? ", today" : ""}, ${
                  count === 0
                    ? "no sessions"
                    : `${count} ${count === 1 ? "session" : "sessions"}`
                }`}
                onClick={() => onPick(date)}
              >
                <span className={w.monthNumber}>{number}</span>
                <span
                  className={w.monthDot}
                  data-filled={count > 0 || undefined}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ol>
    </SheetLayer>
  );
}

function MonthArrow({
  label,
  glyph,
  target,
  onGo,
}: {
  label: string;
  glyph: string;
  target: string | null;
  onGo: (month: string) => void;
}) {
  if (target === null) return <span className={w.arrow} aria-hidden="true" />;
  return (
    <button
      type="button"
      className={w.arrow}
      aria-label={label}
      onClick={() => onGo(target)}
    >
      {glyph}
    </button>
  );
}

/** Whole days from one ISO date to a later one. Dates, so no clock is involved. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00.000Z`) - Date.parse(`${from}T12:00:00.000Z`)) /
      86_400_000,
  );
}
