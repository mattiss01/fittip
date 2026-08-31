import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMonth, monthOf, monthWindow, readRequestedMonth } from "./month";
import { ProgressMonth } from "./progress-month";
import type { ProgressCompletionView } from "./progress-record";
import styles from "./progress.module.css";

import homeStyles from "../home.module.css";
import { isoDateInTimezone } from "@/lib/date/local-date";
import type { Completion } from "@/server/completions/completion-log";
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
  searchParams: Promise<{ month?: string | string[] }>;
};

/**
 * The owner's training record, one owner-local calendar month at a time. The
 * month is a URL search parameter so the view is addressable and the back
 * button steps through the months the owner actually visited. An absent or
 * unreadable parameter falls back to the owner-local current month - never to
 * the server's own month, which would show a stranger's month either side of
 * a month boundary.
 *
 * Progress reads, and only completions. It calls no plan read: ADR-017
 * consequence 3 binds a consumer that reads plan sessions, and topping the
 * window up here would materialize future occurrences as a side effect of
 * looking at history. The planned side of every record comes from the
 * completion's own stored snapshot instead.
 */
export default async function ProgressPage({ searchParams }: Props) {
  const requested = readRequestedMonth((await searchParams).month);

  let profile;
  try {
    profile = await (await createProfileRepository()).getCurrentProfile();
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  const timezoneName = profile?.timezoneName ?? null;
  const currentMonth =
    timezoneName === null
      ? null
      : monthOf(isoDateInTimezone(new Date(), timezoneName));
  const month = currentMonth === null ? null : (requested ?? currentMonth);

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / progress</p>
          <h1>Progress.</h1>
          <p className={homeStyles.intro}>
            Everything you have logged, month by month. It is a record of what
            happened, not a score.
          </p>
        </div>
        {month === null ? null : (
          <p className={homeStyles.stamp}>{formatMonth(month)}</p>
        )}
      </header>
      {timezoneName === null || month === null || currentMonth === null ? (
        <section className={homeStyles.stateCard} data-progress-state="no-zone">
          <p className={homeStyles.sectionLabel}>Time zone needed</p>
          <h2>Confirm your time zone first.</h2>
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
        await renderMonth(
          timezoneName,
          profile?.createdAt ?? null,
          month,
          currentMonth,
        )
      )}
    </main>
  );
}

async function renderMonth(
  timezoneName: string,
  createdAt: string | null,
  month: string,
  currentMonth: string,
) {
  const window = monthWindow(month);

  let completions;
  try {
    // The one read this surface makes, bounded by the month it is showing.
    completions = await (
      await createCompletionLog()
    ).list(window.startDate, window.endDate);
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <ProgressMonth
      month={month}
      currentMonth={currentMonth}
      accountMonth={accountMonth(createdAt, timezoneName, currentMonth)}
      entries={completions.map(toCompletionView)}
    />
  );
}

/**
 * The owner-local month the account was created in, which is the earliest
 * month in which this owner could have had one. An empty current month that is
 * also that month is the start of the record rather than a gap in it, and the
 * empty state says so. A profile without a creation date falls back to the
 * current month, so the sentence stays true rather than being guessed at.
 */
function accountMonth(
  createdAt: string | null,
  timezoneName: string,
  currentMonth: string,
): string {
  if (createdAt === null) return currentMonth;
  const created = new Date(createdAt);
  if (!Number.isFinite(created.valueOf())) return currentMonth;
  return monthOf(isoDateInTimezone(created, timezoneName));
}

/** Only what the surface renders crosses out of the server module. */
function toCompletionView(completion: Completion): ProgressCompletionView {
  // A planned log is named by the snapshot taken when it was written; an
  // unplanned one by the single activity the owner typed, which is the only
  // place its name exists. A log written before that activity was collected
  // has neither, and the entry names it "Unplanned training" as Today does.
  const written = completion.activities[0] ?? null;
  return {
    id: completion.id,
    outcome: completion.status,
    actualLocalDate: completion.actualLocalDate,
    title: completion.plannedSnapshot?.title ?? written?.name ?? null,
    sport: completion.plannedSnapshot?.sport ?? written?.sport ?? null,
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
