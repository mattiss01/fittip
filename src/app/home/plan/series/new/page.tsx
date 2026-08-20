import Link from "next/link";
import { redirect } from "next/navigation";

import { SeriesBuilder, type SeriesSourceView } from "./series-builder";
import { PLAN_WINDOW_DAYS } from "../../action-state";
import styles from "../../plan.module.css";

import homeStyles from "../../../home.module.css";
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

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function NewSeriesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const query = await searchParams;
  const sourceKind = single(query.source);
  const sourceId = single(query.id);

  let profile;
  try {
    profile = await (await createProfileRepository()).getCurrentProfile();
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  if (!profile?.timezoneName) {
    return (
      <StateCard
        title="Confirm your time zone first."
        copy="A recurring rule needs owner-local dates. Return to the Plan, confirm the zone, then choose Repeat again."
        href="/home/plan"
        action="Return to the Plan"
      />
    );
  }

  const today = isoDateInTimezone(new Date(), profile.timezoneName);
  const lastDate = shiftIsoDate(today, PLAN_WINDOW_DAYS - 1);
  let source: SeriesSourceView | null = null;
  let revision = 0;
  try {
    const plan = await createRollingPlan();
    const slicePromise = plan.getPlanSlice(today, lastDate);
    if (sourceKind === "saved" && sourceId) {
      const [slice, saved] = await Promise.all([
        slicePromise,
        (await createSavedSessionLibrary()).get(sourceId),
      ]);
      revision = slice.revision;
      source = saved
        ? {
            kind: "saved",
            id: saved.id,
            label: "saved sessions",
            title: saved.title,
            sport: saved.sport,
            expectedDurationMinutes: saved.expectedDurationMinutes ?? null,
            activityCount: saved.activities.length,
            suggestedStartDate: today,
          }
        : null;
    } else {
      const slice = await slicePromise;
      revision = slice.revision;
      const session =
        sourceKind === "plan" && sourceId
          ? slice.sessions.find(
              (candidate) =>
                candidate.id === sourceId && candidate.status === "active",
            )
          : undefined;
      source = session
        ? {
            kind: "plan",
            id: session.id,
            label: "the Plan",
            title: session.title,
            sport: session.sport,
            expectedDurationMinutes: session.expectedDurationMinutes ?? null,
            activityCount: session.activities.length,
            suggestedStartDate: session.localDate,
          }
        : null;
    }
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  if (!source) {
    return (
      <StateCard
        title="Choose a session to repeat."
        copy="That source is missing or no longer current. Open the Plan or saved sessions and choose Repeat from the session you want."
        href="/home/plan"
        action="Open the current Plan"
      />
    );
  }

  return (
    <main className={homeStyles.shell + " " + styles.page} id="main-content">
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / plan / repeat</p>
          <h1>Build the rule.</h1>
          <p className={homeStyles.intro}>
            Choose a bounded or open-ended rhythm, then review the first dates
            before anything is written to your Plan.
          </p>
        </div>
      </header>
      <Link className={styles.libraryLink} href="/home/plan">
        Back to the Plan
      </Link>
      <p className={homeStyles.stamp}>
        {profile.timezoneName} · Plan revision {revision}
      </p>
      <SeriesBuilder
        source={source}
        today={today}
        lastDate={lastDate}
        expectedRevision={revision}
      />
    </main>
  );
}

function StateCard({
  title,
  copy,
  href,
  action,
}: {
  title: string;
  copy: string;
  href: string;
  action: string;
}) {
  return (
    <main className={homeStyles.shell} id="main-content">
      <section className={homeStyles.stateCard}>
        <p className={homeStyles.kicker}>Recurring sessions</p>
        <h1>{title}</h1>
        <p>{copy}</p>
        <Link className={homeStyles.primaryAction} href={href}>
          {action}
        </Link>
      </section>
    </main>
  );
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
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
