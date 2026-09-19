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
 * one into the proposal would invent a choice the owner does not have. Editing
 * them from inside review is 16B.
 */

export type PlannedSessionSummary = {
  id: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  isLocked: boolean;
  status: "active" | "cancelled";
};

export type ProposalTimelineDay = {
  localDate: string;
  isToday: boolean;
  /** Already on the plan, read-only in this slice. */
  planned: PlannedSessionSummary[];
  /** Already labelled a recovery day before this proposal existed. */
  isRecoveryDay: boolean;
  /** Proposed, awaiting or carrying a choice. */
  items: PlanProposalItemView[];
};

export function buildProposalTimeline(input: {
  startDate: string;
  endDate: string;
  today: string;
  items: PlanProposalItemView[];
  plannedSessions: PlannedSessionSummary[];
  plannedByDate: Map<string, PlannedSessionSummary[]>;
  recoveryDates: readonly string[];
}): ProposalTimelineDay[] {
  const recovery = new Set(input.recoveryDates);
  const itemsByDate = new Map<string, PlanProposalItemView[]>();
  for (const item of input.items) {
    const day = itemsByDate.get(item.localDate) ?? [];
    day.push(item);
    itemsByDate.set(item.localDate, day);
  }

  return datesBetween(input.startDate, input.endDate).map((localDate) => ({
    localDate,
    isToday: localDate === input.today,
    planned: input.plannedByDate.get(localDate) ?? [],
    isRecoveryDay: recovery.has(localDate),
    items: itemsByDate.get(localDate) ?? [],
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
