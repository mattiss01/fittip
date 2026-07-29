import Link from "next/link";
import { redirect } from "next/navigation";

import { isoDateInTimezone } from "@/features/completions/local-date";
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

export default async function TodayPage() {
  const client = await createServerUserClient();
  const plans = new TrainingRecordRepository(client);
  const actuals = new CompletionRepository(client);

  let currentPlan;
  let completions;
  try {
    [currentPlan, completions] = await Promise.all([
      plans.getCurrentPlanSnapshot(),
      actuals.listCurrentCompletions(),
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

  const timezoneName =
    currentPlan?.version.timezoneName ?? completions[0]?.timezoneName ?? "UTC";
  const localDate = isoDateInTimezone(new Date(), timezoneName);
  const sessions =
    currentPlan?.sessions.filter(
      (session) => session.localDate === localDate,
    ) ?? [];
  const unplannedToday = completions.filter(
    (completion) =>
      !completion.plannedSessionId && completion.actualLocalDate === localDate,
  );

  return (
    <main className={styles.shell} id="main-content">
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>FitTip / today</p>
          <h1>Training, as it stands.</h1>
          <p className={styles.intro}>
            {formatLocalDate(localDate)} · {timezoneName}. Planned and actual
            records remain separate.
          </p>
        </div>
        <p className={styles.stamp}>
          {currentPlan
            ? `Current plan · v${currentPlan.version.versionNumber}`
            : "No accepted plan"}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="today-training">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>01 / Planned order</p>
            <h2 id="today-training">Today</h2>
          </div>
          <Link className={styles.secondaryAction} href="/home/log">
            Log unplanned
          </Link>
        </div>

        {sessions.length ? (
          <ol className={styles.grid}>
            {sessions.map((session) => {
              const actual = completions.find(
                (completion) => completion.plannedSessionId === session.id,
              );
              return (
                <li className={styles.card} key={session.id}>
                  <div className={styles.cardHeader}>
                    <div>
                      <p className={styles.kicker}>
                        Session {session.position + 1} · {session.sport}
                      </p>
                      <h2>{session.title}</h2>
                    </div>
                    <span className={styles.status}>
                      {actual
                        ? completionStatusLabel(actual.status)
                        : "Planned"}
                    </span>
                  </div>
                  <dl className={styles.facts}>
                    <Fact
                      label="Intent"
                      value={session.intent ?? "Not recorded"}
                    />
                    <Fact
                      label="Expected"
                      value={
                        session.expectedDurationMinutes === null
                          ? "Not recorded"
                          : `${session.expectedDurationMinutes} min`
                      }
                    />
                    <Fact
                      label="Actual"
                      value={
                        actual
                          ? `${completionStatusLabel(actual.status)} · ${actual.actualLocalDate}`
                          : "Not logged"
                      }
                    />
                  </dl>
                  {session.activities.length ? (
                    <details>
                      <summary>
                        {session.activities.length} planned{" "}
                        {session.activities.length === 1
                          ? "activity"
                          : "activities"}
                      </summary>
                      <ul className={styles.activityList}>
                        {session.activities.map((activity) => (
                          <li key={activity.id}>
                            <strong>{activity.name}</strong> · {activity.sport}
                            {activity.instructions
                              ? ` — ${activity.instructions}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className={styles.actions}>
                    {actual ? (
                      <Link
                        className={styles.primaryAction}
                        href={`/home/progress/completion-${actual.completionGroupId}`}
                      >
                        View actual
                      </Link>
                    ) : (
                      <Link
                        className={styles.primaryAction}
                        href={`/home/log?plannedSession=${session.id}`}
                      >
                        Log training
                      </Link>
                    )}
                    <Link
                      className={styles.secondaryAction}
                      href={`/home/progress/plan-${currentPlan!.version.id}`}
                    >
                      View source plan
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <section className={styles.empty}>
            <p className={styles.kicker}>
              {currentPlan ? "No session today" : "No plan yet"}
            </p>
            <h2>
              {currentPlan ? "No training planned." : "Start with the plan."}
            </h2>
            <p>
              {currentPlan
                ? "Nothing is inferred from an empty date. Add or change training only in Plan."
                : "Choose the next 1–7 days and explicitly save your first manual plan."}
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/home/plan">
                Plan training
              </Link>
              <Link className={styles.secondaryAction} href="/home/log">
                Log unplanned training
              </Link>
            </div>
          </section>
        )}
      </section>

      {unplannedToday.length ? (
        <section className={styles.section} aria-labelledby="unplanned-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionLabel}>02 / Factual only</p>
              <h2 id="unplanned-heading">Unplanned actuals</h2>
            </div>
          </div>
          <ul className={styles.grid}>
            {unplannedToday.map((completion) => (
              <li className={styles.card} key={completion.completionGroupId}>
                <div className={styles.cardHeader}>
                  <h3>{completionStatusLabel(completion.status)} training</h3>
                  <span className={styles.status}>Unplanned</span>
                </div>
                <p className={styles.bodyCopy}>
                  No source plan exists for this factual record.
                </p>
                <Link
                  className={styles.primaryAction}
                  href={`/home/progress/completion-${completion.completionGroupId}`}
                >
                  View actual
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}
