import { redirect } from "next/navigation";

import { PLAN_WINDOW_DAYS } from "./action-state";
import { PlanManager, type PlanSessionView } from "./plan-manager";
import styles from "./plan.module.css";
import { TimezoneConfirmation } from "./timezone-confirmation";

import homeStyles from "../home.module.css";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
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

export default async function PlanPage() {
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
          <p className={homeStyles.kicker}>FitTip / plan</p>
          <h1>Plan ahead.</h1>
          <p className={homeStyles.intro}>
            One continuous plan. Add what you intend to do on today or a later
            date, move it when the week changes, and mark a recovery day when
            you mean to take one.
          </p>
        </div>
      </header>
      {timezoneName === null ? (
        <TimezoneConfirmation />
      ) : (
        <PlanWindow timezoneName={timezoneName} />
      )}
    </main>
  );
}

async function PlanWindow({ timezoneName }: { timezoneName: string }) {
  const today = isoDateInTimezone(new Date(), timezoneName);
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, offset) =>
    shiftIsoDate(today, offset),
  );

  let slice;
  try {
    slice = await (
      await createRollingPlan()
    ).getPlanSlice(today, dates[dates.length - 1]);
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <>
      <p className={homeStyles.stamp}>
        {timezoneName} · Revision {slice.revision}
      </p>
      <PlanManager
        today={today}
        dates={dates}
        expectedRevision={slice.revision}
        sessions={slice.sessions.map(toSessionView)}
        recoveryDates={slice.recoveryDates}
      />
    </>
  );
}

/** Only what the surface renders crosses to the client. */
function toSessionView(session: RollingPlanSession): PlanSessionView {
  return {
    id: session.id,
    localDate: session.localDate,
    position: session.position,
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? null,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    note: session.note ?? null,
    isLocked: session.isLocked,
    status: session.status,
    activityCount: session.activities.length,
  };
}

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError
  ) {
    redirect("/");
  }
}
