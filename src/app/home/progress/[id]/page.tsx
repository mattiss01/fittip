import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CompletionRecord,
  type PlannedSnapshotView,
} from "../completion-record";
import { formatMonth, monthOf } from "../month";
import { describeTarget } from "../planned-target";
import type { ProgressCompletionView } from "../progress-record";
import styles from "../progress.module.css";

import homeStyles from "../../home.module.css";
import type { Completion } from "@/server/completions/completion-log";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * One completion, beside the immutable planned snapshot it was measured
 * against. F-005 Review history step 4 rests on the planned side being the
 * copy the completion stored, so nothing here reads the live plan row.
 *
 * A completion that does not exist and one that belongs to somebody else are
 * the same answer, reached the same way: the repository's read is owner-scoped
 * and returns nothing in both cases, so both render this state after the same
 * single read. Nothing distinguishes them in status, wording, or timing.
 */
export default async function CompletionPage({ params }: Props) {
  const id = (await params).id;

  let completion: Completion | null = null;
  // An id that is not a UUID cannot name a record, so it is refused before any
  // read rather than sent to the database to be refused there.
  if (UUID.test(id)) {
    try {
      completion = await (await createCompletionLog()).get(id.toLowerCase());
    } catch (error) {
      redirectOnAuthError(error);
      throw error;
    }
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / progress</p>
          <h1>One session.</h1>
          <p className={homeStyles.intro}>
            What you recorded, and the plan it was measured against as that plan
            stood at the time.
          </p>
        </div>
      </header>

      {completion === null ? (
        <section
          className={homeStyles.stateCard}
          data-progress-state="no-completion"
        >
          <p className={homeStyles.sectionLabel}>Not found</p>
          <h2>That record is not there.</h2>
          <p>
            It was removed, or the link is not yours. Nothing was changed. Open
            your record and pick a session from the month it belongs to.
          </p>
          <div className={homeStyles.actions}>
            <Link className={homeStyles.primaryAction} href="/home/progress">
              Open Progress
            </Link>
          </div>
        </section>
      ) : (
        <>
          <CompletionRecord
            completion={toCompletionView(completion)}
            timezoneName={completion.timezoneName}
            planned={toPlannedView(completion)}
          />
          <Link
            className={styles.backLink}
            href={`/home/progress?month=${monthOf(completion.actualLocalDate)}`}
          >
            Back to {formatMonth(monthOf(completion.actualLocalDate))}
          </Link>
        </>
      )}
    </main>
  );
}

/** Only what the surface renders crosses out of the server module. */
function toCompletionView(completion: Completion): ProgressCompletionView {
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

function toPlannedView(completion: Completion): PlannedSnapshotView | null {
  const snapshot = completion.plannedSnapshot;
  if (snapshot === null) return null;
  return {
    localDate: snapshot.localDate,
    title: snapshot.title,
    sport: snapshot.sport,
    intent: snapshot.intent ?? null,
    expectedDurationMinutes: snapshot.expectedDurationMinutes ?? null,
    note: snapshot.note ?? null,
    isLocked: snapshot.isLocked,
    status: snapshot.status,
    isRecurring: snapshot.seriesId !== null,
    activities: snapshot.activities.map((activity) => ({
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
      instructions: activity.instructions ?? null,
      target: describeTarget(activity.target ?? null),
    })),
  };
}

function redirectOnAuthError(error: unknown): void {
  if (!(error instanceof CompletionAuthenticationError)) return;
  if (error.accessError?.reason === "not-owner") redirect("/auth/denied");
  redirect("/");
}
