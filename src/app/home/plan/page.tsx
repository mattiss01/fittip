import Link from "next/link";

import {
  saveActivityToLibraryAction,
  updateActivityInLibraryAction,
} from "./activities/actions";
import { readLibraryOptions } from "./activities/library-options";
import { readMeasurementHistory } from "./activities/measurement-history";
import { readSavedSessionOptions } from "./saved/session-options";
import {
  PlanManager,
  type PlanSessionLog,
  type PlanUnplannedLog,
} from "./plan-manager";
import { planHistoryStart, type PlanPhase } from "./plan-weeks";
import { planWindowFor } from "./plan-window";
import {
  readReplacedByCoach,
  redirectOnAuthError,
  toCardView,
} from "./plan-read";
import styles from "./plan.module.css";
import w from "./plan-week.module.css";
import { findUncoveredSeriesDates } from "./series-recurrence";
import { TimezoneConfirmation } from "./timezone-confirmation";

import homeStyles from "../home.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { ROADMAP_ATTENTION_NOTES } from "@/lib/roadmap/roadmap-control-copy";
import {
  ActivityLibraryProvider,
  type LibraryActivityOption,
} from "@/components/training/activity-editor";
import type { SavedSessionOption } from "@/components/training/saved-session-picker";
import type { ModeBySport } from "@/lib/training/measurement-default";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
import {
  readCurrentRoadmapPhases,
  readRoadmapAttention,
  type RoadmapAttention,
} from "@/server/roadmap/roadmap-phases";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ day?: string | string[] }>;
};

export default async function PlanPage({ searchParams }: Props) {
  const requested = (await searchParams).day;
  const initialDate =
    typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : null;
  let timezoneName: string | null;
  // A phase of the roadmap has ended and the owner has not looked yet
  // (ADR-027), or there is no roadmap at all (owner, 16 Oct 2026). The Plan
  // says so with a dot on the Roadmap chip and nothing else. Without a
  // confirmed zone "today" is UTC's, as it is for the Roadmap page and for the
  // database when the review is marked.
  let attention: RoadmapAttention = null;
  try {
    timezoneName =
      (await (await createProfileRepository()).getCurrentProfile())
        ?.timezoneName ?? null;
    attention = await readRoadmapAttention(
      timezoneName === null
        ? new Date().toISOString().slice(0, 10)
        : isoDateInTimezone(new Date(), timezoneName),
    );
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={w.header}>
        <div className={w.headerRow}>
          <h1>Plan</h1>
          {/* Planning with the coach is an action, not a place, so it stands
              apart from the chips and says what it does (owner, 1 Oct 2026). */}
          <Link className={w.coach} href="/home/plan/proposal">
            <CoachSpark />
            Plan with Coach
          </Link>
        </div>
        <nav className={w.chips} aria-label="Plan surfaces">
          <Link
            aria-describedby={
              attention === null ? undefined : "roadmap-attention-note"
            }
            href="/home/plan/roadmap"
          >
            Roadmap
            {attention === null ? null : (
              <span
                aria-hidden="true"
                className={w.chipDot}
                data-roadmap-review-due={
                  attention === "review_due" ? "" : undefined
                }
                data-roadmap-missing={attention === "missing" ? "" : undefined}
                data-roadmap-ended={attention === "ended" ? "" : undefined}
              />
            )}
          </Link>
          <Link href="/home/plan/saved">Session Library</Link>
          <Link href="/home/plan/activities">Activity Library</Link>
        </nav>
        {/* Said as well as shown, as a description: the link is still named
            "Roadmap", which is what it is looked for by. */}
        {attention === null ? null : (
          <span className={w.srOnly} id="roadmap-attention-note">
            {ROADMAP_ATTENTION_NOTES[attention]}
          </span>
        )}
      </header>
      {timezoneName === null ? (
        <TimezoneConfirmation />
      ) : (
        <PlanWindow timezoneName={timezoneName} initialDate={initialDate} />
      )}
    </main>
  );
}

async function PlanWindow({
  timezoneName,
  initialDate,
}: {
  timezoneName: string;
  initialDate: string | null;
}) {
  const { today, lastDate, lastPlaceableDate } = planWindowFor(timezoneName);
  // A quarter of weeks before this one (owner, 2 Oct 2026). Every day before
  // today shows what was planned there and how it was logged, read-only.
  const firstDate = planHistoryStart(today);

  let slice;
  let series;
  let library: LibraryActivityOption[];
  let modes: ModeBySport;
  let savedSessions: SavedSessionOption[];
  let phases: PlanPhase[];
  const logged = new Map<string, PlanSessionLog>();
  let replacedByCoach = new Set<string>();
  let unplannedLogs: PlanUnplannedLog[] = [];
  try {
    const [plan, log] = await Promise.all([
      createRollingPlan(),
      createCompletionLog(),
    ]);
    [slice, series, library, modes, savedSessions, phases] = await Promise.all([
      // Through the last date a single session may sit on (R3b-3). Recurring
      // sessions stop at `lastDate`, so the far weeks hold few rows. Only what
      // the week cards show (owner, 20 Oct 2026): a session's activities,
      // intent, note and open coach suggestion are read by its own page.
      plan.getPlanCards(firstDate, lastPlaceableDate),
      plan.listSeries(),
      readLibraryOptions(),
      readMeasurementHistory(),
      readSavedSessionOptions(),
      readCurrentRoadmapPhases(),
    ]);
    // A logged session reads as logged where it was planned, whatever day
    // the log carries: a Thursday run done on Tuesday is not still ahead on
    // Thursday. A log's own date can be any day before its session's, so the
    // logs are found by session rather than by window, in one read.
    const sessionIds = slice.sessions.map((session) => session.id);
    const [found, replaced, loggedInWindow] = await Promise.all([
      log.findByPlanSessions(sessionIds),
      readReplacedByCoach(slice.sessions),
      log.list(firstDate, today),
    ]);
    replacedByCoach = replaced;
    // Training done without a plan sits on its day like a logged session
    // (owner, 22 Oct 2026), so a past week shows everything that happened.
    unplannedLogs = loggedInWindow
      .filter((completion) => completion.planSessionId === null)
      .map((completion) => ({
        completionId: completion.id,
        localDate: completion.actualLocalDate,
        title: completion.title ?? "Unplanned training",
        sport: completion.sport ?? "",
        ...(completion.durationMinutes === undefined
          ? {}
          : { durationMinutes: completion.durationMinutes }),
      }));
    for (const completion of found) {
      if (completion.planSessionId) {
        logged.set(completion.planSessionId, {
          completionId: completion.id,
          outcome: completion.status,
          actualLocalDate: completion.actualLocalDate,
          ...(completion.durationMinutes === undefined
            ? {}
            : { durationMinutes: completion.durationMinutes }),
        });
      }
    }
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <>
      <ActivityLibraryProvider
        activities={library}
        modes={modes}
        saveToLibrary={saveActivityToLibraryAction}
        updateInLibrary={updateActivityInLibraryAction}
      >
        <PlanManager
          today={today}
          firstDate={firstDate}
          lastPlaceableDate={lastPlaceableDate}
          repeatsThrough={lastDate}
          hasRepeats={series.some(
            (segment) =>
              segment.endDate === undefined || segment.endDate >= today,
          )}
          initialDate={initialDate}
          phases={phases}
          expectedRevision={slice.revision}
          sessions={slice.sessions
            // A session the coach's replacement stands in for is not shown
            // beside it (owner, 19 Oct 2026; ADR-033); the replacement's page
            // brings it back. Trained anyway, it shows as logged.
            .filter(
              (session) =>
                !replacedByCoach.has(session.id) || logged.has(session.id),
            )
            .map((session) => {
              const log = logged.get(session.id);
              return {
                ...toCardView(session),
                ...(log === undefined ? {} : { log }),
              };
            })}
          unplannedLogs={unplannedLogs}
          recoveryDates={slice.recoveryDates}
          savedSessions={savedSessions}
          uncoveredSeriesDates={findUncoveredSeriesDates(
            series,
            slice.sessions,
            today,
            lastDate,
          )}
        />
      </ActivityLibraryProvider>
    </>
  );
}
