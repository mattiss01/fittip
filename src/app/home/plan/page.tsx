import Link from "next/link";
import { redirect } from "next/navigation";

import { PLAN_WINDOW_DAYS } from "./action-state";
import {
  PlanManager,
  type PlanSessionLog,
  type PlanSessionView,
} from "./plan-manager";
import styles from "./plan.module.css";
import type { PlanSeriesView } from "./recurring-session-controls";
import { findUncoveredSeriesDates } from "./series-recurrence";
import { TimezoneConfirmation } from "./timezone-confirmation";

import homeStyles from "../home.module.css";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import type {
  RollingPlanSeries,
  RollingPlanSession,
} from "@/server/rolling-plan/rolling-plan";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  let timezoneName: string | null;
  try {
    timezoneName =
      (await (await createProfileRepository()).getCurrentProfile())
        ?.timezoneName ?? null;
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / plan</p>
          <h1>Plan ahead.</h1>
          <p className={homeStyles.intro}>
            One continuous plan. Add what you intend to do on today or a later
            date, move it when the week changes, and mark a recovery day when
            you mean to take one.
          </p>
        </div>
      </header>
      <nav className={styles.planLinks} aria-label="Plan surfaces">
        <Link className={styles.libraryLink} href="/home/plan/saved">
          Saved sessions
        </Link>
        <Link className={styles.libraryLink} href="/home/plan/roadmap">
          Roadmap
        </Link>
        <Link className={styles.libraryLink} href="/home/plan/proposal">
          Coach proposal
        </Link>
      </nav>
      {timezoneName === null ? (
        <TimezoneConfirmation />
      ) : (
        <PlanWindow timezoneName={timezoneName} />
      )}
    </main>
  );
}

async function PlanWindow({ timezoneName }: { timezoneName: string }) {
  const today = isoDateInTimezone(new Date(), timezoneName);
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, offset) =>
    shiftIsoDate(today, offset),
  );

  let slice;
  let series;
  const logged = new Map<string, PlanSessionLog>();
  try {
    const [plan, log] = await Promise.all([
      createRollingPlan(),
      createCompletionLog(),
    ]);
    [slice, series] = await Promise.all([
      plan.getPlanSlice(today, dates[dates.length - 1]),
      plan.listSeries(),
    ]);
    // A logged session reads as logged where it was planned, whatever day
    // the log carries: a Thursday run done on Tuesday is not still ahead on
    // Thursday. A log's own date can be any day before its session's, so the
    // logs are found by session rather than by window, in one read.
    const found = await log.findByPlanSessions(
      slice.sessions.map((session) => session.id),
    );
    for (const completion of found) {
      if (completion.planSessionId) {
        logged.set(completion.planSessionId, {
          completionId: completion.id,
          outcome: completion.status,
          actualLocalDate: completion.actualLocalDate,
        });
      }
    }
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <>
      <p className={homeStyles.stamp}>
        {timezoneName} · Revision {slice.revision}
      </p>
      <PlanManager
        today={today}
        dates={dates}
        expectedRevision={slice.revision}
        sessions={slice.sessions.map((session) => {
          const log = logged.get(session.id);
          return log === undefined
            ? toSessionView(session)
            : { ...toSessionView(session), log };
        })}
        recoveryDates={slice.recoveryDates}
        series={series.map(toSeriesView)}
        uncoveredSeriesDates={findUncoveredSeriesDates(
          series,
          slice.sessions,
          today,
          dates[dates.length - 1],
        )}
      />
    </>
  );
}

/** Only what the surface renders crosses to the client. */
function toSessionView(session: RollingPlanSession): PlanSessionView {
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
    activities: session.activities.map((activity) => ({
      name: activity.name,
      sport: activity.sport,
      instructions: activity.instructions ?? null,
      measurementMode: activity.measurementMode,
      target: activity.target ?? null,
    })),
    seriesId: session.seriesId,
    occurrenceDate: session.occurrenceDate,
    hasDiverged: session.hasDiverged,
  };
}

function toSeriesView(series: RollingPlanSeries): PlanSeriesView {
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

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError
  ) {
    redirect("/");
  }
}
