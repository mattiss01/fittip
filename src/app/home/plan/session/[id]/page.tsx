import Link from "next/link";
import { redirect } from "next/navigation";

import { planWindowFor } from "../../plan-window";
import {
  saveActivityToLibraryAction,
  updateActivityInLibraryAction,
} from "../../activities/actions";
import { readLibraryOptions } from "../../activities/library-options";
import { toFillProposal } from "../../fill/open-proposals";
import styles from "../../plan.module.css";
import {
  redirectOnAuthError,
  toSeriesView,
  toSessionView,
} from "../../plan-read";
import type { PlanSessionView } from "../../session-view";
import {
  SessionPage,
  type SessionCancellationView,
  type SessionPageOrigin,
} from "./session-page";
import sessionStyles from "./session-page.module.css";

import homeStyles from "../../../home.module.css";
import {
  ActivityLibraryProvider,
  type LibraryActivityOption,
} from "@/components/training/activity-editor";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
import {
  createSessionCancellations,
  SessionCancellationAuthenticationError,
} from "@/server/repositories/session-cancellation-repository";
import type { RollingPlanSeries } from "@/server/rolling-plan/rolling-plan";
import { readOpenSessionActivityProposals } from "@/server/session-detail/open-session-activity-proposals";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    /** Where the page was opened from, from a fixed list: never a URL. */
    from?: string | string[];
    /** The day Today was showing, which finds a session before the window. */
    date?: string | string[];
  }>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * One planned session on its own page (owner, 29 Sep 2026). The Plan and
 * Today list sessions; this is where one is read in full and changed.
 *
 * A session that does not exist and one that belongs to somebody else are the
 * same answer: every read here is owner-scoped, so both come back empty and
 * render the same state. The client decides what an empty answer means right
 * after its own delete, because only it knows that it just deleted something.
 */
export default async function PlanSessionPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const origin: SessionPageOrigin = query.from === "today" ? "today" : "plan";

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
      {/* The global stylesheet centres a main's children and lets each
          shrink to its content; one full-width column keeps the sheet, its
          notice and its panels the same width, as the Plan's manager does. */}
      <div className={sessionStyles.page}>
        {timezoneName === null ? (
          <section className={homeStyles.stateCard}>
            <p className={homeStyles.kicker}>Plan</p>
            <h1>Confirm your time zone first</h1>
            <p>Sessions are planned by your local date.</p>
            <Link className={homeStyles.primaryAction} href="/home/plan">
              Open Plan
            </Link>
          </section>
        ) : (
          <SessionRead
            id={UUID.test(id) ? id.toLowerCase() : null}
            origin={origin}
            requestedDate={readDate(query.date)}
            timezoneName={timezoneName}
          />
        )}
      </div>
    </main>
  );
}

async function SessionRead({
  id,
  origin,
  requestedDate,
  timezoneName,
}: {
  id: string | null;
  origin: SessionPageOrigin;
  requestedDate: string | null;
  timezoneName: string;
}) {
  const { today, lastPlaceableDate } = planWindowFor(timezoneName);

  let session: PlanSessionView | null = null;
  let revision = 0;
  let series: RollingPlanSeries[] = [];
  let library: LibraryActivityOption[] = [];
  let cancellation: SessionCancellationView | null = null;
  try {
    const plan = await createRollingPlan();
    const [slice, allSeries, options] = await Promise.all([
      plan.getPlanSlice(today, lastPlaceableDate),
      plan.listSeries(),
      readLibraryOptions(),
    ]);
    revision = slice.revision;
    series = allSeries;
    library = options;
    let found = slice.sessions.find((candidate) => candidate.id === id);
    // Today can open a session from a day behind the window. That one is
    // history: it is read here to be shown and logged, and every plan verb
    // refuses it anyway, because replanning never reaches the past.
    if (found === undefined && id !== null && requestedDate !== null) {
      if (requestedDate < today) {
        const past = await plan.getPlanSlice(requestedDate, requestedDate);
        found = past.sessions.find((candidate) => candidate.id === id);
      }
    }
    if (found !== undefined) {
      const [logs, open] = await Promise.all([
        (await createCompletionLog()).findByPlanSessions([found.id]),
        readOpenSessionActivityProposals([found.id]),
      ]);
      const log = logs.find(
        (completion) => completion.planSessionId === found.id,
      );
      const fill = open.find((proposal) => proposal.sessionId === found.id);
      session = {
        ...toSessionView(found),
        ...(log === undefined
          ? {}
          : {
              log: {
                completionId: log.id,
                outcome: log.status,
                actualLocalDate: log.actualLocalDate,
              },
            }),
        ...(fill === undefined ? {} : { openFill: toFillProposal(fill) }),
      };
      // Why it was cancelled is read here and nowhere else, and only for a
      // session that is cancelled (owner, 29 Sep 2026).
      if (found.status === "cancelled") {
        cancellation = await (await createSessionCancellations()).get(found.id);
      }
    }
  } catch (error) {
    redirectOnAuthError(error);
    if (error instanceof SessionCancellationAuthenticationError) {
      redirect(
        error.accessError?.reason === "not-owner" ? "/auth/denied" : "/",
      );
    }
    throw error;
  }

  const segment =
    session?.seriesId == null
      ? undefined
      : series.find((candidate) => candidate.id === session.seriesId);

  return (
    <ActivityLibraryProvider
      activities={library}
      saveToLibrary={saveActivityToLibraryAction}
      updateInLibrary={updateActivityInLibraryAction}
    >
      <SessionPage
        session={session}
        series={segment === undefined ? undefined : toSeriesView(segment)}
        today={today}
        dateRange={{ first: today, last: lastPlaceableDate }}
        expectedRevision={revision}
        origin={origin}
        originDate={requestedDate}
        cancellation={cancellation}
      />
    </ActivityLibraryProvider>
  );
}

function readDate(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}
