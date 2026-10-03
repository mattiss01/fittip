"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

import styles from "./today.module.css";

import { slideTowards } from "@/components/motion/slide";

/**
 * The days above Today's heading, swiped sideways like the Plan's week
 * tiles (owner, 3 Oct 2026): seven across, snapping to whole days, with the
 * day on screen in the middle when the page opens.
 *
 * A Client Component only because a row that scrolls has to be told where
 * to start; every day in it is an ordinary link to that day.
 */
export function DayStrip({
  dates,
  shown,
  today,
}: {
  /** Every day the strip offers, oldest first. */
  dates: string[];
  /** The day on screen. */
  shown: string;
  today: string;
}) {
  const stripRef = useRef<HTMLElement>(null);

  // Before the first paint, so the row does not open on its oldest day and
  // then jump. Only the strip scrolls: `scrollIntoView` would move the page.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const days = strip?.children;
    const index = dates.indexOf(shown);
    if (!strip || !days || index < 0) return;
    const pitch =
      days.length > 1
        ? days[1].getBoundingClientRect().left -
          days[0].getBoundingClientRect().left
        : 0;
    const before =
      pitch > 0
        ? Math.round(
            (strip.clientWidth - days[index].getBoundingClientRect().width) /
              2 /
              pitch,
          )
        : 0;
    const leftmost = days[Math.max(0, index - before)];
    const inset = Number.parseFloat(getComputedStyle(strip).paddingLeft) || 0;
    strip.scrollLeft +=
      leftmost.getBoundingClientRect().left -
      strip.getBoundingClientRect().left -
      inset;
  }, [dates, shown]);

  return (
    <nav className={styles.strip} aria-label="Days" ref={stripRef}>
      {dates.map((date) => (
        <Link
          key={date}
          className={styles.stripDay}
          href={`/home/today?date=${date}`}
          transitionTypes={slideTowards(shown, date)}
          aria-current={date === shown ? "date" : undefined}
          aria-label={SHORT_DAY.format(asDate(date))}
          data-today={date === today}
        >
          <span className={styles.stripWeekday} aria-hidden="true">
            {WEEKDAY.format(asDate(date))}
          </span>
          <span className={styles.stripNumber} aria-hidden="true">
            {Number(date.slice(8, 10))}
          </span>
          <span className={styles.stripDot} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function asDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}
