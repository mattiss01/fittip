import Link from "next/link";
import { redirect } from "next/navigation";

import { SavedLibrary, type SavedSessionView } from "./saved-library";
import styles from "./saved.module.css";

import { planWindowFor } from "../plan-window";
import {
  saveActivityToLibraryAction,
  updateActivityInLibraryAction,
} from "../activities/actions";
import { readLibraryOptions } from "../activities/library-options";
import homeStyles from "../../home.module.css";
import {
  ActivityLibraryProvider,
  type LibraryActivityOption,
} from "@/components/training/activity-editor";
import { toActivityValue } from "@/lib/training/activity-value";
import { PersonalActivityAuthenticationError } from "@/server/repositories/personal-activity-repository";
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
  let activities: LibraryActivityOption[];
  try {
    // The reads are independent, so none waits on another.
    const [profile, library, options] = await Promise.all([
      (await createProfileRepository()).getCurrentProfile(),
      (await createSavedSessionLibrary()).list(),
      readLibraryOptions(),
    ]);
    timezoneName = profile?.timezoneName ?? null;
    saved = library;
    activities = options;
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
      <ActivityLibraryProvider
        activities={activities}
        saveToLibrary={saveActivityToLibraryAction}
        updateInLibrary={updateActivityInLibraryAction}
      >
        {timezoneName === null ? (
          <ReuseUnavailable sessions={saved} />
        ) : (
          <ReadyLibrary timezoneName={timezoneName} sessions={saved} />
        )}
      </ActivityLibraryProvider>
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
        dateRange={null}
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
  const { today, lastPlaceableDate } = planWindowFor(timezoneName);

  let planRevision: number;
  try {
    planRevision = (
      await (await createRollingPlan()).getPlanSlice(today, lastPlaceableDate)
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
        dateRange={{ first: today, last: lastPlaceableDate }}
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
    activities: session.activities.map(toActivityValue),
  };
}

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof SavedSessionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof SavedSessionAuthenticationError ||
    error instanceof PersonalActivityAuthenticationError
  ) {
    redirect("/");
  }
}
