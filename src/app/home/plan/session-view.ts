import type { PlanActionDraft } from "./action-state";
import type { FillProposal } from "./fill/fill-state";
import {
  TRAINED_OUTCOMES,
  type CompletionOutcome,
} from "../log/log-action-state";

import type { ActivityValue } from "@/components/training/activity-editor";

/** One planned session as its own page renders it. */
export type PlanSessionView = {
  id: string;
  localDate: string;
  position: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  /** `HH:MM`, or null when untimed. */
  startTime: string | null;
  note: string | null;
  /** What the coach and the owner settled the session is for (ADR-040). */
  coachNote: string | null;
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

/**
 * A session as a week card on the Plan shows it (owner, 20 Oct 2026): what
 * the card prints and links by. The rest is read by the session's own page,
 * so forty weeks of it are not sent to draw the cards.
 */
export type PlanCardView = Pick<
  PlanSessionView,
  | "id"
  | "localDate"
  | "position"
  | "title"
  | "sport"
  | "expectedDurationMinutes"
  | "startTime"
  | "status"
  | "seriesId"
  | "log"
>;

/** Training logged without a planned session, on the day it was done. */
export type PlanUnplannedLog = {
  completionId: string;
  localDate: string;
  title: string;
  sport: string;
  /** When it started, `HH:MM` in the log's own zone, where it says. */
  startTime?: string;
  durationMinutes?: number;
};

/**
 * An unplanned log as a week card draws it: the card a session logged on
 * its own day gets, so a past day reads the same whether it was planned
 * (owner, 22 Oct 2026). Its id is the log's; nothing plans, drags or swipes
 * it.
 */
export function unplannedLogCard(log: PlanUnplannedLog): PlanCardView {
  return {
    id: log.completionId,
    localDate: log.localDate,
    position: Number.MAX_SAFE_INTEGER,
    title: log.title,
    sport: log.sport,
    expectedDurationMinutes: null,
    startTime: log.startTime ?? null,
    status: "active",
    seriesId: null,
    log: {
      completionId: log.completionId,
      outcome: "unplanned",
      actualLocalDate: log.localDate,
      ...(log.durationMinutes === undefined
        ? {}
        : { durationMinutes: log.durationMinutes }),
    },
  };
}

export type PlanSessionLog = {
  completionId: string;
  outcome: CompletionOutcome;
  actualLocalDate: string;
  /** How long the log says it took, where the owner gave it. */
  durationMinutes?: number;
};

/**
 * A session reads as logged on the Plan when the log settles what the plan
 * still shows: trained on another day, so it is not still ahead here, or
 * trained after it was cancelled. Logged on its own day, or skipped or
 * replaced ahead of time, its card keeps the plan's look.
 *
 * Not the test for plan controls: since 3 Oct 2026 (owner) any log settles
 * the session, and its page offers Edit log instead (`session-page.tsx`).
 */
export function readsAsLogged<
  T extends Pick<PlanSessionView, "localDate" | "status" | "log">,
>(session: T): session is T & { log: PlanSessionLog } {
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
    startTime: session.startTime ?? "",
    note: session.note ?? "",
    coachNote: session.coachNote ?? "",
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

/**
 * The session's edit page (owner, 19 Oct 2026), opened the same way as the
 * session, so saving or going back returns to where it came from.
 */
export function sessionEditHref(
  sessionId: string,
  opened: { from?: "today"; date: string } | null = null,
) {
  const [path, query] = sessionHref(sessionId, opened).split("?");
  return query === undefined ? `${path}/edit` : `${path}/edit?${query}`;
}
