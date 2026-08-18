import Link from "next/link";
import { redirect } from "next/navigation";

import { SavedLibrary, type SavedSessionView } from "./saved-library";
import styles from "./saved.module.css";

import { PLAN_WINDOW_DAYS } from "../action-state";
import homeStyles from "../../home.module.css";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import {
  createSavedSessionLibrary,
  SavedSessionAuthenticationError,
} from "@/server/repositories/saved-session-repository";
import type { SavedSession } from "@/server/saved-sessions/saved-sessions";

export const dynamic = "force-dynamic";

export default async function SavedSessionsPage() {
  let timezoneName: string | null;
  let saved: SavedSession[];
  try {
    // Both reads are independent, so neither waits on the other.
    const [profile, library] = await Promise.all([
      (await createProfileRepository()).getCurrentProfile(),
      (await createSavedSessionLibrary()).list(),
    ]);
    timezoneName = profile?.timezoneName ?? null;
    saved = library;
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / plan / saved</p>
          <h1>Saved sessions.</h1>
          <p className={homeStyles.intro}>
            Sessions you kept to use again. Each one is a copy: changing an
            entry here changes nothing already in your plan, and changing a
            planned session changes nothing here.
          </p>
        </div>
      </header>
      <Link className={styles.backLink} href="/home/plan">
        Back to the plan
      </Link>
      {timezoneName === null ? (
        <ReuseUnavailable sessions={saved} />
      ) : (
        <ReadyLibrary timezoneName={timezoneName} sessions={saved} />
      )}
    </main>
  );
}

/**
 * Without a stored zone there is no owner-local today, so no date can honestly
 * be offered. The library is still readable and still editable.
 */
function ReuseUnavailable({ sessions }: { sessions: SavedSession[] }) {
  return (
    <>
      <p className={homeStyles.stamp}>Time zone not confirmed</p>
      <SavedLibrary
        dates={[]}
        planRevision={0}
        sessions={sessions.map(toSavedSessionView)}
      />
    </>
  );
}

async function ReadyLibrary({
  timezoneName,
  sessions,
}: {
  timezoneName: string;
  sessions: SavedSession[];
}) {
  const today = isoDateInTimezone(new Date(), timezoneName);
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, offset) =>
    shiftIsoDate(today, offset),
  );

  let planRevision: number;
  try {
    planRevision = (
      await (
        await createRollingPlan()
      ).getPlanSlice(today, dates[dates.length - 1])
    ).revision;
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <>
      <p className={homeStyles.stamp}>
        {sessions.length} saved · Plan revision {planRevision}
      </p>
      <SavedLibrary
        dates={dates}
        planRevision={planRevision}
        sessions={sessions.map(toSavedSessionView)}
      />
    </>
  );
}

/** Only what the surface renders crosses to the client. */
function toSavedSessionView(session: SavedSession): SavedSessionView {
  return {
    id: session.id,
    revision: session.revision,
    name: session.name,
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? null,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    note: session.note ?? null,
    activities: session.activities.map((activity) => ({
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
    })),
  };
}

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof SavedSessionAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof SavedSessionAuthenticationError
  ) {
    redirect("/");
  }
}
