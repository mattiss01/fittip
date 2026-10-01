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
import { recordsTraining } from "../../log/log-action-state";
import { SaveToLibrary } from "../../plan/saved/save-to-library";
import {
  replacedByLabel,
  replacesLabels,
  type Completion,
} from "@/server/completions/completion-log";
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
      {/* The way back is at the top, as on a planned session's page (R3);
          the session's own name is the page's heading. */}
      <Link
        className={styles.backLink}
        href={
          completion === null
            ? "/home/progress"
            : `/home/progress?month=${monthOf(completion.actualLocalDate)}`
        }
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {completion === null
          ? "Progress"
          : formatMonth(monthOf(completion.actualLocalDate))}
      </Link>

      {completion === null ? (
        <section
          className={homeStyles.stateCard}
          data-progress-state="no-completion"
        >
          <h1>That record is not there.</h1>
          <p>It was removed, or the link is not yours. Nothing was changed.</p>
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
          {/* The one log editor, opened from here and returning here, so a
              correction does not go by way of Today. */}
          <Link
            className={styles.mainAction}
            href={`/home/log?completion=${completion.id}&from=progress`}
          >
            Edit log
          </Link>
          {/* Training that happened can become a saved session; a skip or a
              replacement records none, so it offers nothing to save. */}
          {!recordsTraining(completion.status) ? null : (
            <SaveToLibrary
              completionId={completion.id}
              defaultName={
                completion.title ?? completion.plannedSnapshot?.title ?? ""
              }
            />
          )}
        </>
      )}
    </main>
  );
}

/** Only what the surface renders crosses out of the server module. */
function toCompletionView(completion: Completion): ProgressCompletionView {
  return {
    id: completion.id,
    outcome: completion.status,
    actualLocalDate: completion.actualLocalDate,
    title: completion.title ?? completion.plannedSnapshot?.title ?? null,
    sport: completion.sport ?? completion.plannedSnapshot?.sport ?? null,
    plannedLocalDate: completion.plannedSnapshot?.localDate ?? null,
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    feeling: completion.feeling ?? null,
    note: completion.note ?? null,
    replacementDescription: completion.replacementDescription ?? null,
    replacedBy: replacedByLabel(completion),
    replaces: replacesLabels(completion),
    activities: completion.activities.map((activity) => ({
      position: activity.position,
      name: activity.name,
      detail: describeTarget(activity.actualMeasurement ?? null),
    })),
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
