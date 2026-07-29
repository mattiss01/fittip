import Link from "next/link";
import { redirect } from "next/navigation";

import { completionStatusLabel } from "@/features/completions/status-label";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  CompletionAuthenticationError,
  CompletionRepository,
} from "@/server/repositories/completion-repository";
import {
  TrainingRecordAuthenticationError,
  TrainingRecordRepository,
} from "@/server/repositories/training-record-repository";
import styles from "../home.module.css";

export const dynamic = "force-dynamic";

type TimelineEvent =
  | {
      kind: "plan";
      at: string;
      id: string;
      versionNumber: number;
      dayCount: number;
      startDate: string;
      endDate: string;
      current: boolean;
    }
  | {
      kind: "completion";
      at: string;
      id: string;
      status: string;
      actualLocalDate: string;
      durationMinutes?: number;
      revisionNumber: number;
      planned: boolean;
    };

export default async function ProgressPage() {
  const client = await createServerUserClient();
  const plans = new TrainingRecordRepository(client);
  const actuals = new CompletionRepository(client);

  let versions;
  let completions;
  let head;
  try {
    [versions, completions, head] = await Promise.all([
      plans.listPlanVersions(),
      actuals.listCurrentCompletions(),
      plans.getCurrentPlanHead(),
    ]);
  } catch (error) {
    if (
      (error instanceof TrainingRecordAuthenticationError ||
        error instanceof CompletionAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof TrainingRecordAuthenticationError ||
      error instanceof CompletionAuthenticationError
    ) {
      redirect("/");
    }
    throw error;
  }

  const events: TimelineEvent[] = [
    ...versions.map((version) => ({
      kind: "plan" as const,
      at: version.acceptedAt,
      id: version.id,
      versionNumber: version.versionNumber,
      dayCount: version.dayCount,
      startDate: version.startDate,
      endDate: version.endDate,
      current: head?.currentVersionId === version.id,
    })),
    ...completions.map((completion) => ({
      kind: "completion" as const,
      at: completion.createdAt,
      id: completion.completionGroupId,
      status: completion.status,
      actualLocalDate: completion.actualLocalDate,
      durationMinutes: completion.durationMinutes,
      revisionNumber: completion.revisionNumber,
      planned: Boolean(completion.plannedSessionId),
    })),
  ].toSorted((left, right) => right.at.localeCompare(left.at));

  return (
    <main className={styles.shell} id="main-content">
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>FitTip / progress</p>
          <h1>Facts, in order.</h1>
          <p className={styles.intro}>
            Accepted plans, completed training, and corrections. No score,
            streak, trend, or coaching judgment.
          </p>
        </div>
        <p className={styles.stamp}>
          {versions.length} plan{" "}
          {versions.length === 1 ? "version" : "versions"} ·{" "}
          {completions.length} actual{" "}
          {completions.length === 1 ? "record" : "records"}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="timeline-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>Chronological ledger</p>
            <h2 id="timeline-heading">Progress</h2>
          </div>
        </div>

        {events.length ? (
          <ol className={styles.timeline}>
            {events.map((event) => (
              <li
                className={`${styles.timelineItem} ${styles.card}`}
                key={`${event.kind}-${event.id}`}
              >
                <p className={styles.timelineMeta}>
                  {formatTimestamp(event.at)} ·{" "}
                  {event.kind === "plan" ? "Accepted plan" : "Actual fact"}
                </p>
                {event.kind === "plan" ? (
                  <>
                    <div className={styles.cardHeader}>
                      <h2>Plan version {event.versionNumber}</h2>
                      <span className={styles.status}>
                        {event.current ? "Current plan" : "Earlier plan"}
                      </span>
                    </div>
                    <dl className={styles.facts}>
                      <Fact label="Starts" value={event.startDate} />
                      <Fact label="Ends" value={event.endDate} />
                      <Fact
                        label="Horizon"
                        value={`${event.dayCount} ${event.dayCount === 1 ? "day" : "days"}`}
                      />
                    </dl>
                    <Link
                      className={styles.primaryAction}
                      href={`/home/progress/plan-${event.id}`}
                    >
                      Open plan version
                    </Link>
                  </>
                ) : (
                  <>
                    <div className={styles.cardHeader}>
                      <h2>{completionStatusLabel(event.status)} training</h2>
                      <span className={styles.status}>
                        {event.planned ? "Linked to plan" : "Unplanned"}
                      </span>
                    </div>
                    <dl className={styles.facts}>
                      <Fact label="Actual date" value={event.actualLocalDate} />
                      <Fact
                        label="Duration"
                        value={
                          event.durationMinutes === undefined
                            ? "Not recorded"
                            : `${event.durationMinutes} min`
                        }
                      />
                      <Fact
                        label="Corrections"
                        value={
                          event.revisionNumber > 1
                            ? `${event.revisionNumber - 1} preserved`
                            : "None"
                        }
                      />
                    </dl>
                    <Link
                      className={styles.primaryAction}
                      href={`/home/progress/completion-${event.id}`}
                    >
                      Compare planned and actual
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <section className={styles.empty}>
            <p className={styles.kicker}>Empty ledger</p>
            <h2>No plan or actual records yet.</h2>
            <p>
              Progress appears only after you explicitly save a plan or log
              training.
            </p>
            <Link className={styles.primaryAction} href="/home/plan">
              Plan training
            </Link>
          </section>
        )}
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
