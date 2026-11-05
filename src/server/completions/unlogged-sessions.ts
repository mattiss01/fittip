import "server-only";

import { shiftIsoDate } from "@/lib/date/local-date";
import { byStartTime } from "@/lib/training/start-time";
import type { CompletionLog } from "@/server/completions/completion-log";
import type {
  RollingPlan,
  RollingPlanSessionCard,
} from "@/server/rolling-plan/rolling-plan";

/**
 * The first day the reminder looks at (owner, 5 Nov 2026): nothing planned
 * before the reminder shipped, so it never opens on months of sessions that
 * will not be logged now. Every session from this day on is listed until it
 * has a log, however long ago it was.
 */
export const UNLOGGED_SINCE = "2026-11-05";

/** A planned session on a past day that has no log, as the reminder lists it. */
export type UnloggedSession = Pick<
  RollingPlanSessionCard,
  | "id"
  | "localDate"
  | "position"
  | "title"
  | "sport"
  | "expectedDurationMinutes"
  | "startTime"
>;

/**
 * The past sessions still waiting for a log, oldest first. A cancelled
 * session is not waiting for anything, and that includes one a coach's
 * replacement stands in for (ADR-033), which is cancelled. A log of any
 * outcome settles a session, as it does on the Plan: Skipped is an answer.
 * Today's sessions are not listed; the day is not over.
 */
export function unloggedSessions(
  sessions: readonly RollingPlanSessionCard[],
  loggedSessionIds: ReadonlySet<string>,
  today: string,
): UnloggedSession[] {
  return sessions
    .filter(
      (session) =>
        session.status === "active" &&
        session.localDate < today &&
        !loggedSessionIds.has(session.id),
    )
    .toSorted(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        byStartTime(left, right),
    )
    .map((session) => ({
      id: session.id,
      localDate: session.localDate,
      position: session.position,
      title: session.title,
      sport: session.sport,
      expectedDurationMinutes: session.expectedDurationMinutes,
      startTime: session.startTime,
    }));
}

/**
 * Reads the plan from `since` through yesterday and the logs of what it holds.
 * Only reads: nothing here logs, skips or cancels a session. Past days need
 * no top-up, since a series is written ahead of its days, not after them.
 */
export async function readUnloggedSessions(
  plan: RollingPlan,
  log: CompletionLog,
  today: string,
  since: string = UNLOGGED_SINCE,
): Promise<UnloggedSession[]> {
  const yesterday = shiftIsoDate(today, -1);
  if (yesterday < since) return [];
  const { sessions } = await plan.getPlanCards(since, yesterday);
  const open = sessions.filter((session) => session.status === "active");
  if (open.length === 0) return [];
  const logs = await log.findByPlanSessions(open.map((session) => session.id));
  const logged = new Set(
    logs
      .map((completion) => completion.planSessionId)
      .filter((id): id is string => id !== null),
  );
  return unloggedSessions(open, logged, today);
}
