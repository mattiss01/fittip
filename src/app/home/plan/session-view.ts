import type { PlanActionDraft } from "./action-state";
import type { FillProposal } from "./fill/fill-state";
import {
  TRAINED_OUTCOMES,
  type CompletionOutcome,
} from "../log/log-action-state";

import type { ActivityValue } from "@/components/training/activity-editor";

/** One planned session as the Plan and its own page render it. */
export type PlanSessionView = {
  id: string;
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  isLocked: boolean;
  status: "active" | "cancelled";
  /** The rows the edit form binds, and the list the card prints. */
  activities: ActivityValue[];
  seriesId: string | null;
  occurrenceDate: string | null;
  hasDiverged: boolean;
  /**
   * The log attached to this session, on whatever day it was written. A logged
   * session reads as logged here, with no plan controls: one trained on
   * another day is not still ahead, and a cancelled one trained anyway is not
   * cancelled. The plan row and the log's snapshot keep what the plan said.
   */
  log?: PlanSessionLog;
  /** A coach's suggestion for this session nobody has accepted or dismissed. */
  openFill?: FillProposal;
};

export type PlanSessionLog = {
  completionId: string;
  outcome: CompletionOutcome;
  actualLocalDate: string;
};

/**
 * A session reads as logged when the log settles what the plan still shows:
 * trained on another day, so it is not still ahead here, or trained after it
 * was cancelled. Logged on its own day, or skipped or replaced ahead of time,
 * it keeps its plan controls, which is where a series is ended from.
 */
export function readsAsLogged(
  session: PlanSessionView,
): session is PlanSessionView & { log: PlanSessionLog } {
  return (
    session.log !== undefined &&
    (session.status === "cancelled" ||
      (session.log.actualLocalDate !== session.localDate &&
        TRAINED_OUTCOMES.has(session.log.outcome)))
  );
}

export function draftOf(session: PlanSessionView): PlanActionDraft {
  return {
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? "",
    expectedDurationMinutes:
      session.expectedDurationMinutes === null
        ? ""
        : String(session.expectedDurationMinutes),
    note: session.note ?? "",
  };
}

export function stampDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

/**
 * A day on the Plan, so a page can return to it: `day` opens the week that
 * holds it, and the anchor scrolls to the day.
 */
export function planDayHref(date: string) {
  return `/home/plan?day=${date}#plan-day-${date}`;
}

/**
 * Where a session's own page lives. `date` is the session's day, which is how
 * one from before today is found: Today always passes it, and the Plan does
 * for every day before today. `from` is a fixed value, never a URL,
 * and decides only where the page's back link goes.
 */
export function sessionHref(
  sessionId: string,
  opened: { from?: "today"; date: string } | null = null,
) {
  if (opened === null) return `/home/plan/session/${sessionId}`;
  return opened.from === "today"
    ? `/home/plan/session/${sessionId}?from=today&date=${opened.date}`
    : `/home/plan/session/${sessionId}?date=${opened.date}`;
}
