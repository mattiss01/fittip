import "server-only";

import { redirect } from "next/navigation";

import type { PlanSeriesView } from "./recurring-session-controls";
import type { PlanCardView, PlanSessionView } from "./session-view";

import { toActivityValue } from "@/lib/training/activity-value";
import { CompletionAuthenticationError } from "@/server/repositories/completion-log-repository";
import { PersonalActivityAuthenticationError } from "@/server/repositories/personal-activity-repository";
import { ProfileAuthenticationError } from "@/server/repositories/profile-repository";
import { RollingPlanAuthenticationError } from "@/server/repositories/rolling-plan-repository";
import {
  CoachCancellationAuthenticationError,
  createCoachCancellations,
  type CoachCancellationSession,
} from "@/server/repositories/coach-cancellation-repository";
import type {
  RollingPlanSeries,
  RollingPlanSession,
  RollingPlanSessionCard,
} from "@/server/rolling-plan/rolling-plan";
import { RoadmapAuthenticationError } from "@/server/roadmap/roadmap-phases";
import { SessionActivityAuthenticationError } from "@/server/session-detail/open-session-activity-proposals";

/** Only what the surface renders crosses to the client. */
export function toSessionView(session: RollingPlanSession): PlanSessionView {
  return {
    id: session.id,
    localDate: session.localDate,
    position: session.position,
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? null,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    note: session.note ?? null,
    status: session.status,
    activities: session.activities.map(toActivityValue),
    seriesId: session.seriesId,
    occurrenceDate: session.occurrenceDate,
    hasDiverged: session.hasDiverged,
  };
}

/** A week card's share of a session; its log is added beside it. */
export function toCardView(session: RollingPlanSessionCard): PlanCardView {
  return {
    id: session.id,
    localDate: session.localDate,
    position: session.position,
    title: session.title,
    sport: session.sport,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    status: session.status,
    seriesId: session.seriesId,
  };
}

export function toSeriesView(series: RollingPlanSeries): PlanSeriesView {
  return {
    id: series.id,
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    weekdays: series.weekdays ?? [],
    startDate: series.startDate,
    endDate: series.endDate ?? null,
    title: series.title,
    sport: series.sport,
    intent: series.intent ?? null,
    expectedDurationMinutes: series.expectedDurationMinutes ?? null,
    note: series.note ?? null,
  };
}

/**
 * The ids of cancelled sessions a coach's replacement stands beside (owner,
 * 19 Oct 2026; ADR-033). The Plan and Today leave them out, so a day shows
 * the replacement and not both; the replacement's own page brings one back.
 * `sessions` must hold the replacement too, which a day's read does when
 * they share the day. Reads nothing when nothing in it is cancelled.
 */
export async function readReplacedByCoach(
  sessions: readonly CoachCancellationSession[],
): Promise<Set<string>> {
  if (!sessions.some((session) => session.status === "cancelled")) {
    return new Set();
  }
  return (await createCoachCancellations()).listHiddenByReplacement(sessions);
}

export function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError ||
    error instanceof SessionActivityAuthenticationError ||
    error instanceof RoadmapAuthenticationError ||
    error instanceof CoachCancellationAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError ||
    error instanceof SessionActivityAuthenticationError ||
    error instanceof RoadmapAuthenticationError ||
    error instanceof CoachCancellationAuthenticationError
  ) {
    redirect("/");
  }
}
