"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  watchTransition,
  WATCH_INTERVAL_MS,
  type TransitionWatch,
} from "@/lib/app-router/transition-watchdog";

/**
 * Session-scoped, non-personal, versioned markers that survive the recovery
 * reload. They carry no plan content, only the fact that the reload was
 * self-triggered. Each surface has its own, so a reload the Plan triggered is
 * never announced on a session's page the owner opens next.
 */
export const RECOVERY_FLAG = "fittip.plan.recovered:v1";
export const SERIES_RECOVERY_FLAG = "fittip.plan.series-change.recovered:v1";
export const SESSION_RECOVERY_FLAG = "fittip.plan.session.recovered:v1";
export const SESSION_SERIES_RECOVERY_FLAG =
  "fittip.plan.session.series-change.recovered:v1";

export const RECOVERED_NOTICE =
  "Your last plan change did not appear, so the plan was reloaded. What you see below is what is saved.";

/**
 * A mutation whose reply never reaches the surface. See
 * `@/lib/app-router/transition-watchdog` for what these two verdicts can and
 * cannot honestly claim; this action answers 200 for every outcome, so neither
 * verdict ever says the change saved.
 */
export type MutationStall = Exclude<TransitionWatch, "waiting">;

export function useMutationStall(
  pending: boolean,
  submission: number,
  flag: string = RECOVERY_FLAG,
): MutationStall | null {
  const [stall, setStall] = useState<{
    key: string;
    verdict: MutationStall;
  } | null>(null);
  const respondedAt = useRef<number | null>(null);
  const consumedAt = useRef<number | null>(null);
  const key = `${submission}:${pending}`;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
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
    markRecovered(flag, false);
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
        markRecovered(flag, true);
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
  }, [flag, key, pending]);

  return stall?.key === key ? stall.verdict : null;
}

export function useRecoveredReload(
  submission: number,
  flag: string = RECOVERY_FLAG,
): boolean {
  const recovered = useSyncExternalStore(
    subscribeNothing,
    () => readRecovered(flag),
    () => false,
  );
  return recovered && submission === 0;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(flag: string): boolean {
  try {
    return window.sessionStorage.getItem(flag) !== null;
  } catch {
    return false;
  }
}

function markRecovered(flag: string, recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(flag, "1");
    else window.sessionStorage.removeItem(flag);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}

export function stallNotice(stall: TransitionWatch | null) {
  if (stall === "lost-render") {
    return "This plan change did not appear. Reloading the plan to show what is saved.";
  }
  if (stall === "unconfirmed") {
    return "This plan change has not been confirmed. Reload to see whether it was saved.";
  }
  return null;
}
