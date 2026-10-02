import Link from "next/link";

import {
  saveActivityToLibraryAction,
  updateActivityInLibraryAction,
} from "./activities/actions";
import { readLibraryOptions } from "./activities/library-options";
import type { FillProposal } from "./fill/fill-state";
import { toFillProposal } from "./fill/open-proposals";
import { readSavedSessionOptions } from "./saved/session-options";
import { PlanManager, type PlanSessionLog } from "./plan-manager";
import { mondayOf, type PlanPhase } from "./plan-weeks";
import { planWindowFor } from "./plan-window";
import { redirectOnAuthError, toSessionView } from "./plan-read";
import styles from "./plan.module.css";
import w from "./plan-week.module.css";
import { findUncoveredSeriesDates } from "./series-recurrence";
import { TimezoneConfirmation } from "./timezone-confirmation";

import homeStyles from "../home.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import {
  ActivityLibraryProvider,
  type LibraryActivityOption,
} from "@/components/training/activity-editor";
import type { SavedSessionOption } from "@/components/training/saved-session-picker";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
import { readCurrentRoadmapPhases } from "@/server/roadmap/roadmap-phases";
import { readOpenSessionActivityProposals } from "@/server/session-detail/open-session-activity-proposals";

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
          <Link href="/home/plan/roadmap">Roadmap</Link>
          <Link href="/home/plan/saved">Session Library</Link>
          <Link href="/home/plan/activities">Activity Library</Link>
        </nav>
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
  // The first week starts on the Monday on or before today, and its days
  // before today show what was planned there, read-only.
  const firstDate = mondayOf(today);

  let slice;
  let series;
  let library: LibraryActivityOption[];
  let savedSessions: SavedSessionOption[];
  let phases: PlanPhase[];
  const logged = new Map<string, PlanSessionLog>();
  const openFills = new Map<string, FillProposal>();
  try {
    const [plan, log] = await Promise.all([
      createRollingPlan(),
      createCompletionLog(),
    ]);
    [slice, series, library, savedSessions, phases] = await Promise.all([
      // Through the last date a single session may sit on (R3b-3). Recurring
      // sessions stop at `lastDate`, so the far weeks hold few rows.
      plan.getPlanSlice(firstDate, lastPlaceableDate),
      plan.listSeries(),
      readLibraryOptions(),
      readSavedSessionOptions(),
      readCurrentRoadmapPhases(),
    ]);
    // A logged session reads as logged where it was planned, whatever day
    // the log carries: a Thursday run done on Tuesday is not still ahead on
    // Thursday. A log's own date can be any day before its session's, so the
    // logs are found by session rather than by window, in one read.
    const sessionIds = slice.sessions.map((session) => session.id);
    const [found, open] = await Promise.all([
      log.findByPlanSessions(sessionIds),
      readOpenSessionActivityProposals(sessionIds),
    ]);
    for (const proposal of open) {
      if (proposal.sessionId) {
        openFills.set(proposal.sessionId, toFillProposal(proposal));
      }
    }
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
      <ActivityLibraryProvider
        activities={library}
        saveToLibrary={saveActivityToLibraryAction}
        updateInLibrary={updateActivityInLibraryAction}
      >
        <PlanManager
          today={today}
          lastDate={lastPlaceableDate}
          repeatsThrough={lastDate}
          initialDate={initialDate}
          phases={phases}
          expectedRevision={slice.revision}
          sessions={slice.sessions.map((session) => {
            const log = logged.get(session.id);
            const openFill = openFills.get(session.id);
            return {
              ...toSessionView(session),
              ...(log === undefined ? {} : { log }),
              ...(openFill === undefined ? {} : { openFill }),
            };
          })}
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
