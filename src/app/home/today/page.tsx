import Link from "next/link";
import { redirect } from "next/navigation";

import {
  TodayDay,
  type TodayCompletionView,
  type TodaySessionView,
} from "./today-day";
import styles from "./today.module.css";

import homeStyles from "../home.module.css";
import { planWindowFor } from "../plan/plan-window";
import type { Completion } from "@/server/completions/completion-log";
import { readPlanWindowToppedUp } from "@/server/completions/plan-window-top-up";
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
import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string | string[] }>;
};

/**
 * One owner-local day of plan content, and the completions the owner wrote on
 * it. The day is a URL search parameter so the view is addressable and the
 * back button steps through the days the owner actually visited. An absent or
 * unreadable parameter falls back to owner-local today - never to the server's
 * own date, which would show a stranger's day either side of midnight.
 *
 * Today reads. Every write on this surface is a link to `/home/log`.
 */
export default async function TodayPage({ searchParams }: Props) {
  const requested = readRequestedDate((await searchParams).date);

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
          <p className={homeStyles.kicker}>FitTip / today</p>
          <h1>Today.</h1>
          <p className={homeStyles.intro}>
            One day of your plan at a time. Log what you actually did, and page
            back or forward to any other day.
          </p>
        </div>
      </header>
      {timezoneName === null ? (
        <section className={homeStyles.stateCard} data-today-state="no-zone">
          <p className={homeStyles.sectionLabel}>Time zone needed</p>
          <h2>Confirm your time zone first.</h2>
          <p>
            Your day starts and ends on your own calendar, and FitTip does not
            guess which one that is. Confirm your zone on the Plan and this day
            appears.
          </p>
          <div className={homeStyles.actions}>
            <Link className={homeStyles.primaryAction} href="/home/plan">
              Open Plan
            </Link>
          </div>
        </section>
      ) : (
        await renderDay(timezoneName, requested)
      )}
    </main>
  );
}

async function renderDay(timezoneName: string, requested: string | null) {
  // One definition of owner-local today and of how far ahead the plan is
  // filled, shared with the Plan surface and its writes.
  const { today, lastDate } = planWindowFor(timezoneName);
  const date = requested ?? today;

  let window;
  let completions;
  try {
    const [plan, log] = await Promise.all([
      createRollingPlan(),
      createCompletionLog(),
    ]);
    // ADR-017 consequence 3: a consumer that is not the Plan has to top the
    // window up before reading it, or knowingly read an incomplete plan. Both
    // reads are bounded by the one day this view shows.
    [window, completions] = await Promise.all([
      readPlanWindowToppedUp(plan, date, date),
      log.list(date, date),
    ]);
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  const byPlanSession = new Map<string, Completion>();
  for (const completion of completions) {
    if (completion.planSessionId !== null) {
      byPlanSession.set(completion.planSessionId, completion);
    }
  }
  const sessions = window.slice.sessions
    .filter((session) => session.localDate === date)
    .toSorted((left, right) => left.position - right.position)
    .map((session) =>
      toSessionView(session, byPlanSession.get(session.id) ?? null),
    );
  const carried = new Set(
    sessions
      .map((session) => session.completion?.id)
      .filter((id): id is string => id !== undefined),
  );

  return (
    <>
      <p className={homeStyles.stamp}>
        {timezoneName} · Revision {window.slice.revision}
      </p>
      <TodayDay
        date={date}
        today={today}
        lastPlannedDate={lastDate}
        isRecoveryDay={window.slice.recoveryDates.includes(date)}
        toppedUp={window.toppedUp}
        sessions={sessions}
        unattached={completions
          .filter((completion) => !carried.has(completion.id))
          .map(toCompletionView)}
      />
    </>
  );
}

/** Only what the surface renders crosses out of the server module. */
function toSessionView(
  session: RollingPlanSession,
  completion: Completion | null,
): TodaySessionView {
  return {
    id: session.id,
    position: session.position,
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? null,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    note: session.note ?? null,
    isLocked: session.isLocked,
    status: session.status,
    isRecurring: session.seriesId !== null,
    activityCount: session.activities.length,
    completion: completion === null ? null : toCompletionView(completion),
  };
}

function toCompletionView(completion: Completion): TodayCompletionView {
  return {
    id: completion.id,
    outcome: completion.status,
    actualLocalDate: completion.actualLocalDate,
    title: completion.plannedSnapshot?.title ?? null,
    plannedLocalDate: completion.plannedSnapshot?.localDate ?? null,
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    feeling: completion.feeling ?? null,
    note: completion.note ?? null,
    replacementDescription: completion.replacementDescription ?? null,
    pain: completion.painReported,
    illness: completion.illnessReported,
    injury: completion.injuryReported,
    severeFatigue: completion.severeFatigueReported,
  };
}

/**
 * A date the owner asked for, or nothing. Nothing is not an error: the caller
 * falls back to owner-local today, so a mistyped or stale link still opens a
 * real day rather than a blank one.
 */
function readRequestedDate(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return value;
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
