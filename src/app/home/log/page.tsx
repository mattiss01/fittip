import Link from "next/link";
import { redirect } from "next/navigation";

import { LogForm, type LogExistingView, type LogPlannedView } from "./log-form";
import styles from "./log.module.css";

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
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    completion?: string | string[];
    plannedSession?: string | string[];
    date?: string | string[];
  }>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The form that writes one completion. It is opened for a planned session, for
 * unplanned training on a day, or for a record that already exists; the three
 * differ only in what the form starts from, so one form serves all of them.
 *
 * Log writes. It never changes the plan: the planned session it names is read
 * only to confirm the day that session sits on, and is otherwise untouched.
 */
export default async function LogPage({ searchParams }: Props) {
  const params = await searchParams;
  const completionId = readUuid(params.completion);
  const plannedSessionId = readUuid(params.plannedSession);

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
          <p className={homeStyles.kicker}>FitTip / log</p>
          <h1>Log training.</h1>
          <p className={homeStyles.intro}>
            What actually happened, in your own words. This is a separate
            permanent record; writing it never changes your plan.
          </p>
        </div>
      </header>
      {timezoneName === null ? (
        <Unavailable
          label="Time zone needed"
          heading="Confirm your time zone first."
          body="Training is recorded against a day on your own calendar, and FitTip does not guess which one that is. Confirm your zone on the Plan and this form appears."
          href="/home/plan"
          action="Open Plan"
          state="no-zone"
        />
      ) : (
        await renderForm(timezoneName, completionId, plannedSessionId, params)
      )}
      <Link className={styles.backLink} href="/home/today">
        Back to Today
      </Link>
    </main>
  );
}

async function renderForm(
  timezoneName: string,
  completionId: string | null,
  plannedSessionId: string | null,
  params: { date?: string | string[] },
) {
  const today = isoDateInTimezone(new Date(), timezoneName);
  const date = readDate(params.date) ?? today;

  try {
    if (completionId !== null) {
      const completion = await (await createCompletionLog()).get(completionId);
      if (completion === null) {
        return (
          <Unavailable
            label="Not found"
            heading="That log is not there."
            body="It was removed, or the link is not yours. Nothing was changed."
            href="/home/today"
            action="Back to Today"
            state="no-completion"
          />
        );
      }
      const snapshot = completion.plannedSnapshot;
      return (
        <>
          <SourceCard
            label="Editing a log"
            title={snapshot?.title ?? "Unplanned training"}
            meta={[
              snapshot?.sport ?? null,
              snapshot === null
                ? null
                : `Planned for ${longDay(snapshot.localDate)}`,
            ]}
          />
          <LogForm
            planned={
              snapshot === null || completion.planSessionId === null
                ? null
                : {
                    id: completion.planSessionId,
                    localDate: snapshot.localDate,
                    title: snapshot.title,
                    sport: snapshot.sport,
                    expectedDurationMinutes:
                      snapshot.expectedDurationMinutes ?? null,
                  }
            }
            existing={toExistingView(completion)}
            defaultDate={completion.actualLocalDate}
            returnDate={completion.actualLocalDate}
          />
        </>
      );
    }

    if (plannedSessionId !== null) {
      // One day rather than the whole window. The slice is owner-scoped
      // either way, so this is not an access control; it keeps the read small
      // and the not-found state specific to the day the link named.
      const slice = await (await createRollingPlan()).getPlanSlice(date, date);
      const session = slice.sessions.find(
        (candidate) => candidate.id === plannedSessionId,
      );
      if (session === undefined) {
        return (
          <Unavailable
            label="Not on this day"
            heading="That session is not on this day."
            body="It was moved, deleted, or the link is not yours. Open the day again and pick the session from there."
            href={`/home/today?date=${date}`}
            action="Open that day"
            state="no-session"
          />
        );
      }
      const planned: LogPlannedView = {
        id: session.id,
        localDate: session.localDate,
        title: session.title,
        sport: session.sport,
        expectedDurationMinutes: session.expectedDurationMinutes ?? null,
      };
      return (
        <>
          <SourceCard
            label="Logging a planned session"
            title={planned.title}
            meta={[
              planned.sport,
              planned.expectedDurationMinutes === null
                ? null
                : `${planned.expectedDurationMinutes} min planned`,
              longDay(planned.localDate),
            ]}
          />
          <LogForm
            planned={planned}
            existing={null}
            defaultDate={planned.localDate}
            returnDate={planned.localDate}
          />
        </>
      );
    }

    return (
      <>
        <SourceCard
          label="Logging unplanned training"
          title="Training that was not on the plan"
          meta={[longDay(date)]}
        />
        <LogForm
          planned={null}
          existing={null}
          defaultDate={date}
          returnDate={date}
        />
      </>
    );
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }
}

function SourceCard({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta: (string | null)[];
}) {
  return (
    <section className={styles.sourceCard} data-log-source>
      <p className={styles.sectionLabel}>{label}</p>
      <h2>{title}</h2>
      <p className={styles.sourceMeta}>{meta.filter(Boolean).join(" · ")}</p>
    </section>
  );
}

function Unavailable({
  label,
  heading,
  body,
  href,
  action,
  state,
}: {
  label: string;
  heading: string;
  body: string;
  href: string;
  action: string;
  state: string;
}) {
  return (
    <section className={homeStyles.stateCard} data-log-state={state}>
      <p className={homeStyles.sectionLabel}>{label}</p>
      <h2>{heading}</h2>
      <p>{body}</p>
      <div className={homeStyles.actions}>
        <Link className={homeStyles.primaryAction} href={href}>
          {action}
        </Link>
      </div>
    </section>
  );
}

function toExistingView(completion: Completion): LogExistingView {
  return {
    id: completion.id,
    revision: completion.revision,
    outcome: completion.status,
    actualLocalDate: completion.actualLocalDate,
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

function longDay(date: string) {
  return LONG_DAY.format(new Date(`${date}T00:00:00.000Z`));
}

function readUuid(value: string | string[] | undefined): string | null {
  return typeof value === "string" && UUID.test(value)
    ? value.toLowerCase()
    : null;
}

function readDate(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return value;
}

function redirectOnAuthError(error: unknown): void {
  const accessError =
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError
      ? error.accessError
      : undefined;
  if (accessError?.reason === "not-owner") redirect("/auth/denied");
  if (
    error instanceof ProfileAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof CompletionAuthenticationError
  ) {
    redirect("/");
  }
}
