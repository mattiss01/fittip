import { redirect } from "next/navigation";

import { SavedLibrary, type SavedSessionView } from "./saved-library";

import { planWindowFor } from "../plan-window";
import { SubPageHeader } from "../sub-page-header";
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
    <main className={homeStyles.shell} id="main-content">
      {/* The line that survives the old intro is the one a library can be
          misread without: an entry is a copy, not the planned session. The
          plan's revision was shown here and told the owner nothing. */}
      <SubPageHeader
        title="Session Library"
        line="Each one is a copy. Changing it here changes nothing in your plan."
        aside={
          timezoneName === null
            ? "Time zone not confirmed"
            : `${saved.length} saved`
        }
      />
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
    <SavedLibrary
      dateRange={null}
      planRevision={0}
      sessions={sessions.map(toSavedSessionView)}
    />
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
    <SavedLibrary
      dateRange={{ first: today, last: lastPlaceableDate }}
      planRevision={planRevision}
      sessions={sessions.map(toSavedSessionView)}
    />
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
