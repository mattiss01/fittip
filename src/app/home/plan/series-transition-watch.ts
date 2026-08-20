"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  watchTransition,
  WATCH_INTERVAL_MS,
  type TransitionWatch,
} from "@/lib/app-router/transition-watchdog";

type MutationStall = Exclude<TransitionWatch, "waiting">;

/**
 * Ticket-local transition glue for the new recurrence actions. This is the
 * fifth copy recorded by M3-12's limitation; existing call sites deliberately
 * stay untouched in this ticket.
 */
export function useSeriesMutationStall(
  pending: boolean,
  submission: number,
  recoveryFlag: string,
): MutationStall | null {
  const [stall, setStall] = useState<{
    key: string;
    verdict: MutationStall;
  } | null>(null);
  const respondedAt = useRef<number | null>(null);
  const consumedAt = useRef<number | null>(null);
  const key = submission + ":" + pending;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = origin + pathname + search;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (seen === null) return;
      if (respondedAt.current === null || seen > respondedAt.current) {
        respondedAt.current = seen;
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    markRecovered(recoveryFlag, false);
    const submittedAt = performance.now();
    let reload = 0;
    const interval = window.setInterval(() => {
      const verdict = watchTransition({
        submittedAt,
        respondedAt: respondedAt.current,
        consumedAt: consumedAt.current,
        now: performance.now(),
      });
      if (verdict === "waiting") return;
      window.clearInterval(interval);
      setStall({ key, verdict });
      if (verdict === "lost-render") {
        markRecovered(recoveryFlag, true);
        reload = window.setTimeout(
          () => window.location.reload(),
          RECOVERY_NOTICE_MS,
        );
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [key, pending, recoveryFlag]);

  return stall?.key === key ? stall.verdict : null;
}

export function useSeriesRecoveredReload(
  submission: number,
  recoveryFlag: string,
) {
  const recovered = useSyncExternalStore(
    subscribeNothing,
    () => readRecovered(recoveryFlag),
    () => false,
  );
  return recovered && submission === 0;
}

export function seriesStallNotice(stall: TransitionWatch | null) {
  if (stall === "lost-render") {
    return "This recurring-session change did not appear. Reloading the Plan to show what is saved.";
  }
  if (stall === "unconfirmed") {
    return "This recurring-session change has not been confirmed. Reload to see whether it was saved.";
  }
  return null;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(recoveryFlag: string): boolean {
  try {
    return window.sessionStorage.getItem(recoveryFlag) !== null;
  } catch {
    return false;
  }
}

function markRecovered(recoveryFlag: string, recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(recoveryFlag, "1");
    else window.sessionStorage.removeItem(recoveryFlag);
  } catch {
    // Losing the explanation marker never prevents the recovery reload.
  }
}
