import "server-only";

import { redirect } from "next/navigation";

import type { PlanSeriesView } from "./recurring-session-controls";
import type { PlanSessionView } from "./session-view";

import { toActivityValue } from "@/lib/training/activity-value";
import { CompletionAuthenticationError } from "@/server/repositories/completion-log-repository";
import { PersonalActivityAuthenticationError } from "@/server/repositories/personal-activity-repository";
import { ProfileAuthenticationError } from "@/server/repositories/profile-repository";
import { RollingPlanAuthenticationError } from "@/server/repositories/rolling-plan-repository";
import type {
  RollingPlanSeries,
  RollingPlanSession,
} from "@/server/rolling-plan/rolling-plan";
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
    isLocked: session.isLocked,
    status: session.status,
    activities: session.activities.map(toActivityValue),
    seriesId: session.seriesId,
    occurrenceDate: session.occurrenceDate,
    hasDiverged: session.hasDiverged,
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

export function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError ||
    error instanceof SessionActivityAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError ||
    error instanceof SessionActivityAuthenticationError
  ) {
    redirect("/");
  }
}
