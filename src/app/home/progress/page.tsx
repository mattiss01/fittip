import Link from "next/link";
import { redirect } from "next/navigation";

import { monthOf, monthWindow, readRequestedMonth } from "./month";
import { ProgressMonth } from "./progress-month";
import type { ProgressCompletionView } from "./progress-record";
import { readRequestedSport, sportColours } from "./sport-colours";
import { startTimeOf } from "./start-time-of";
import styles from "./progress.module.css";

import homeStyles from "../home.module.css";
import { LogDeletedNote } from "@/components/home/log-deleted-note";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  replacedByLabel,
  replacesLabels,
  type Completion,
} from "@/server/completions/completion-log";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    month?: string | string[];
    /** One of the owner's sports, or absent for all of them (P1). */
    sport?: string | string[];
    /** "deleted" after a log opened from here was deleted (ADR-031). */
    log?: string | string[];
  }>;
};

/**
 * The owner's training record, one owner-local calendar month at a time,
 * split by sport (owner, 5 Nov 2026, P1). The month and the sport are URL
 * search parameters so the view is addressable and the back button steps
 * through what the owner actually visited. An absent or unreadable month
 * falls back to the owner-local current month - never to the server's own
 * month, which would show a stranger's month either side of a month boundary
 * - and a sport the owner has never logged falls back to all of them.
 *
 * Progress reads, and only completions. It calls no plan read: ADR-017
 * consequence 3 binds a consumer that reads plan sessions, and topping the
 * window up here would materialize future occurrences as a side effect of
 * looking at history. The planned side of every record comes from the
 * completion's own stored snapshot instead.
 */
export default async function ProgressPage({ searchParams }: Props) {
  const query = await searchParams;
  const requested = readRequestedMonth(query.month);

  let profile;
  try {
    profile = await (await createProfileRepository()).getCurrentProfile();
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  const timezoneName = profile?.timezoneName ?? null;
  const today =
    timezoneName === null ? null : isoDateInTimezone(new Date(), timezoneName);
  const currentMonth = today === null ? null : monthOf(today);
  const month = currentMonth === null ? null : (requested ?? currentMonth);

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={styles.header}>
        <h1>Progress</h1>
      </header>
      <LogDeletedNote flag={query.log} />
      {timezoneName === null ||
      today === null ||
      month === null ||
      currentMonth === null ? (
        <section className={homeStyles.stateCard} data-progress-state="no-zone">
          <p className={homeStyles.sectionLabel}>Time zone needed</p>
          <h2>Confirm your time zone first</h2>
          <p>
            Your months start and end on your own calendar, and FitTip does not
            guess which one that is. Confirm your zone on the Plan and your
            record appears.
          </p>
          <div className={homeStyles.actions}>
            <Link className={homeStyles.primaryAction} href="/home/plan">
              Open Plan
            </Link>
          </div>
        </section>
      ) : (
        await renderMonth({
          timezoneName,
          createdAt: profile?.createdAt ?? null,
          month,
          currentMonth,
          today,
          requestedSport: query.sport,
        })
      )}
    </main>
  );
}

async function renderMonth({
  timezoneName,
  createdAt,
  month,
  currentMonth,
  today,
  requestedSport,
}: {
  timezoneName: string;
  createdAt: string | null;
  month: string;
  currentMonth: string;
  today: string;
  requestedSport: string | string[] | undefined;
}) {
  const window = monthWindow(month);

  let completions;
  let sportUse;
  try {
    const log = await createCompletionLog();
    // The month, bounded by the month it is showing; and which sports the
    // owner has logged over their whole record, which orders and colours the
    // chips the same way in every month.
    [completions, sportUse] = await Promise.all([
      log.list(window.startDate, window.endDate),
      log.sportUse(),
    ]);
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  const sports = sportColours(sportUse.map(({ sport }) => sport));
  const sport = readRequestedSport(
    requestedSport,
    sports.map((entry) => entry.sport),
  );

  return (
    <ProgressMonth
      month={month}
      currentMonth={currentMonth}
      today={today}
      accountMonth={accountMonth(createdAt, timezoneName)}
      sports={sports}
      sport={sport}
      entries={completions.map(toCompletionView)}
    />
  );
}

/**
 * The owner-local month the account was created in, which is the earliest
 * month in which this owner could have had one. An empty current month that is
 * also that month is the start of the record rather than a gap in it, and the
 * empty state says so.
 *
 * `null` when there is no usable creation date. The first-run sentence tells
 * the owner they created their account this month, so falling back to the
 * current month here would put a claim on the screen that nothing had checked.
 * The caller uses the ordinary empty-month sentence instead, which is true
 * whatever the account's age.
 */
function accountMonth(
  createdAt: string | null,
  timezoneName: string,
): string | null {
  if (createdAt === null) return null;
  const created = new Date(createdAt);
  if (!Number.isFinite(created.valueOf())) return null;
  return monthOf(isoDateInTimezone(created, timezoneName));
}

/** Only what the surface renders crosses out of the server module. */
function toCompletionView(completion: Completion): ProgressCompletionView {
  // A log carries its own name. One written before logs did falls back to
  // the snapshot it was measured against; an unplanned one that never had a
  // name has neither, and is named "Unplanned training" as it always was.
  return {
    id: completion.id,
    outcome: completion.status,
    actualLocalDate: completion.actualLocalDate,
    title: completion.title ?? completion.plannedSnapshot?.title ?? null,
    sport: completion.sport ?? completion.plannedSnapshot?.sport ?? null,
    plannedLocalDate: completion.plannedSnapshot?.localDate ?? null,
    startTime: startTimeOf(completion),
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    note: completion.note ?? null,
    replacementDescription: completion.replacementDescription ?? null,
    replacedBy: replacedByLabel(completion),
    replaces: replacesLabels(completion),
    // What its activities measured, in the words the log form wrote them
    // with; the card shows the first of them (P1).
    activities: completion.activities.map((activity) => ({
      position: activity.position,
      name: activity.name,
      detail: describeMeasurement(activity.actualMeasurement ?? null),
    })),
    pain: completion.painReported,
    illness: completion.illnessReported,
    injury: completion.injuryReported,
    severeFatigue: completion.severeFatigueReported,
  };
}

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof CompletionAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof CompletionAuthenticationError
  ) {
    redirect("/");
  }
}
