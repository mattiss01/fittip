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
import { BackLink } from "../../you/back-link";
import { DeleteLog } from "../../log/delete-log";
import { deleteLogTarget } from "../../log/delete-log-target";
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
  searchParams?: Promise<{
    from?: string | string[];
    date?: string | string[];
  }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
export default async function CompletionPage({ params, searchParams }: Props) {
  const id = (await params).id;
  const query = (await searchParams) ?? {};

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
      <BackLink {...backTo(completion, query)} />

      {completion === null ? (
        <section
          className={homeStyles.stateCard}
          data-progress-state="no-completion"
        >
          <h1>That record is not there</h1>
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
            planned={toPlannedView(completion)}
          />
          {/* The one log editor, opened from here and returning here, so a
              correction does not go by way of Today. */}
          <div className={styles.logActions}>
            <Link
              className={styles.mainAction}
              href={`/home/log?completion=${completion.id}&from=progress`}
            >
              Edit log
            </Link>
            {/* Beside Edit log, not inside the form (owner, 20 Oct 2026). */}
            <DeleteLog
              {...deleteLogTarget(completion)}
              leaveTo={backTo(completion, query).afterDelete}
            />
          </div>
          {/* Training that happened can become a saved session; a skip or a
              replacement records none, so it offers nothing to save. */}
          {!recordsTraining(completion.status) ? null : (
            <SaveToLibrary completionId={completion.id} />
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

/**
 * Back where the record was opened from (owner, 20 Oct 2026): a log on Today
 * or the Plan opens here, and its way back, and where a delete leaves for,
 * is that page. From the Plan a delete leaves for the session, which is free
 * again; `deleteLogAction` admits only these shapes.
 */
function backTo(
  completion: Completion | null,
  query: { from?: string | string[]; date?: string | string[] },
): { href: string; label: string; afterDelete: string } {
  if (completion === null) {
    return {
      href: "/home/progress",
      label: "Progress",
      afterDelete: "/home/progress",
    };
  }
  if (
    query.from === "today" &&
    typeof query.date === "string" &&
    ISO_DATE.test(query.date)
  ) {
    const today = `/home/today?date=${query.date}`;
    return { href: today, label: "Today", afterDelete: today };
  }
  if (query.from === "plan") {
    return {
      href: "/home/plan",
      label: "Plan",
      afterDelete:
        completion.planSessionId === null
          ? "/home/progress"
          : `/home/plan/session/${completion.planSessionId}`,
    };
  }
  return {
    href: `/home/progress?month=${monthOf(completion.actualLocalDate)}`,
    label: formatMonth(monthOf(completion.actualLocalDate)),
    afterDelete: "/home/progress",
  };
}

function redirectOnAuthError(error: unknown): void {
  if (!(error instanceof CompletionAuthenticationError)) return;
  if (error.accessError?.reason === "not-owner") redirect("/auth/denied");
  redirect("/");
}
