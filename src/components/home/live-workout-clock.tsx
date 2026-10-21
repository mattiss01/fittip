"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import styles from "./live-workout-clock.module.css";

import {
  activeMilliseconds,
  formatClock,
  type LiveWorkoutView,
} from "@/lib/training/live-workout";

type ClockSource = Pick<
  LiveWorkoutView,
  "startedAt" | "pausedAt" | "pausedSeconds"
>;

/** Whole seconds, so a snapshot is stable until the second turns. */
function subscribeToSeconds(onTick: () => void) {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const noSecond = () => null;

/**
 * The workout's time, ticking once a second. Empty on the server and until
 * the page is interactive: the server's clock and the phone's differ, so a
 * time drawn on the server would be replaced on hydration, not continued.
 */
export function useLiveClock(source: ClockSource): string {
  const second = useSyncExternalStore<number | null>(
    subscribeToSeconds,
    currentSecond,
    noSecond,
  );
  return second === null
    ? "–:––"
    : formatClock(activeMilliseconds(source, second * 1000));
}

/**
 * A running workout's clock on every page under /home (owner, 21 Oct 2026):
 * training goes on while the owner looks something up, and this is the way
 * back to it. Not drawn on the workout's own page, which has the large one.
 */
export function LiveWorkoutPill({
  workout,
}: {
  workout: ClockSource & { title: string };
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const clock = useLiveClock(workout);
  // Not on the workout's own page, which has the large clock, nor while the
  // workout is being logged.
  if (
    pathname === "/home/log/live" ||
    (pathname === "/home/log" && search.has("workout"))
  ) {
    return null;
  }
  const paused = workout.pausedAt !== null;
  return (
    <>
      {/* Holds the pill's room at the top, so no page starts under it. */}
      <div className={styles.room} aria-hidden="true" />
      <Link
        className={styles.pill}
        href="/home/log/live"
        data-live-pill
        aria-label={`Back to your workout, ${workout.title}, ${paused ? "paused at" : ""} ${clock}`}
      >
        <span
          className={paused ? styles.dotPaused : styles.dot}
          aria-hidden="true"
        />
        <span className={styles.title}>{workout.title}</span>
        <strong className={styles.time}>{clock}</strong>
        <span aria-hidden="true">›</span>
      </Link>
    </>
  );
}
