import type { ActivityValue } from "@/components/training/activity-editor";
import type { PlanProposalItemView } from "@/lib/plan/plan-proposal-view";

/**
 * The merged review timeline: one row per day, holding what is already planned
 * and what is proposed for it, in that order.
 *
 * It is built here rather than in the page so it can be tested without a
 * database, and it imports nothing from `@/server/**` beyond a type, so the
 * Client Component that renders it may import these shapes too.
 *
 * The merge rule is deliberately one-directional. A session the plan already
 * holds is shown as context and is never turned into a proposed item: the coach
 * was given those sessions as context and did not re-propose them, so copying
 * one into the proposal would invent a choice the owner does not have. M3-16B
 * made those sessions editable in place; it did not change that rule.
 */

export type PlannedSessionSummary = {
  id: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  status: "active" | "cancelled";
  /**
   * M3-16B. The edit form inside review is the plan's own, so it needs every
   * field that form writes — an editor opening on a blank intent would clear
   * one the owner had written on the plan surface.
   */
  intent: string | null;
  note: string | null;
  /**
   * The session's activities, library links included, in order. The edit form
   * submits the whole list and the plan's edit replaces the stored one with
   * it, so a form opened without them erased them — which is what it did from
   * A2 until this field existed.
   */
  activities: ActivityValue[];
  /**
   * Non-null when this occurrence belongs to a recurring series. Review offers
   * no scope choice, so the surface uses it to say which scope it is taking.
   */
  seriesId: string | null;
};

/**
 * The planned session a proposed item would stand in for (ADR-024), as it is
 * now rather than as it was when the owner marked it.
 *
 * `available` is false once the session is logged, cancelled or gone. The
 * finish then adds the proposed session beside it and deletes nothing, so the
 * surface says that instead of offering a replace that will not happen.
 */
export type ProposalReplaceTarget = {
  /** Null when the session is no longer on the plan at all. */
  title: string | null;
  expectedDurationMinutes: number | null;
  available: boolean;
};

export type ProposalTimelineItem = PlanProposalItemView & {
  replaces: ProposalReplaceTarget | null;
};

/** What a planned session's card says about the item that would replace it. */
export type ProposalReplacement = { title: string; isChosen: boolean };

export type ProposalTimelineDay = {
  localDate: string;
  isToday: boolean;
  /**
   * Owner-local, and behind today. A proposal starts on or after today, but a
   * review left open across midnight — or a generation claimed the day
   * before its own UTC date, which the claim function permits — puts the
   * first day of the timeline in the past. `changePlanAction` reads its slice
   * over `today..today+13` and refuses anything outside it, so the surface uses
   * this to withhold controls that would fail rather than offering them.
   */
  isPast: boolean;
  /** Already on the plan, read-only in this slice. */
  planned: PlannedSessionSummary[];
  /** Already labelled a recovery day before this proposal existed. */
  isRecoveryDay: boolean;
  /** Proposed, awaiting or carrying a choice. */
  items: ProposalTimelineItem[];
  /**
   * By planned session id: the proposed session that would replace it, while
   * that is still possible and the owner has not chosen otherwise.
   */
  replacements: Record<string, ProposalReplacement>;
};

export function buildProposalTimeline(input: {
  startDate: string;
  endDate: string;
  today: string;
  items: PlanProposalItemView[];
  plannedSessions: PlannedSessionSummary[];
  plannedByDate: Map<string, PlannedSessionSummary[]>;
  recoveryDates: readonly string[];
  /** Planned sessions with training logged against them. */
  loggedSessionIds?: ReadonlySet<string>;
}): ProposalTimelineDay[] {
  const recovery = new Set(input.recoveryDates);
  const logged = input.loggedSessionIds ?? new Set<string>();
  const plannedById = new Map(
    input.plannedSessions.map((session) => [session.id, session]),
  );
  const replacements: Record<string, ProposalReplacement> = {};
  const itemsByDate = new Map<string, ProposalTimelineItem[]>();
  for (const item of input.items) {
    const target =
      item.replacesSessionId === null
        ? undefined
        : plannedById.get(item.replacesSessionId);
    const replaces: ProposalReplaceTarget | null =
      item.replacesSessionId === null
        ? null
        : {
            title: target?.title ?? null,
            expectedDurationMinutes: target?.expectedDurationMinutes ?? null,
            available:
              target !== undefined &&
              target.status === "active" &&
              !logged.has(target.id),
          };
    if (
      target !== undefined &&
      replaces?.available &&
      (item.decision === "proposed" || item.decision === "staged")
    ) {
      replacements[target.id] = {
        title: item.title ?? "",
        isChosen: item.decision === "staged",
      };
    }
    const day = itemsByDate.get(item.localDate) ?? [];
    day.push({ ...item, replaces });
    itemsByDate.set(item.localDate, day);
  }

  return datesBetween(input.startDate, input.endDate).map((localDate) => ({
    localDate,
    isToday: localDate === input.today,
    isPast: localDate < input.today,
    planned: input.plannedByDate.get(localDate) ?? [],
    isRecoveryDay: recovery.has(localDate),
    items: itemsByDate.get(localDate) ?? [],
    replacements,
  }));
}

/**
 * Inclusive, and bounded.
 *
 * The horizon is at most seven days by contract, but this is fed a start and an
 * end read back from the database, so it refuses to iterate forever if those
 * ever disagree.
 */
export function datesBetween(startDate: string, endDate: string): string[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return [];
  }
  const dates: string[] = [];
  for (let ms = start; ms <= end && dates.length < 7; ms += 86_400_000) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

export function groupPlannedByDate(
  sessions: readonly (PlannedSessionSummary & { localDate: string })[],
): Map<string, PlannedSessionSummary[]> {
  const grouped = new Map<string, PlannedSessionSummary[]>();
  for (const session of sessions) {
    const day = grouped.get(session.localDate) ?? [];
    day.push(session);
    grouped.set(session.localDate, day);
  }
  return grouped;
}
