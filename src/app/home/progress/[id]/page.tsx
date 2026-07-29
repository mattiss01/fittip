import Link from "next/link";
import { redirect } from "next/navigation";

import type {
  CompletionHistory,
  CompletionRevision,
  PlannedSessionSnapshot,
} from "@/features/completions/completion-types";
import { completionStatusLabel } from "@/features/completions/status-label";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  CompletionAuthenticationError,
  CompletionRepository,
} from "@/server/repositories/completion-repository";
import {
  type PlanVersionSnapshot,
  TrainingRecordAuthenticationError,
  TrainingRecordRepository,
} from "@/server/repositories/training-record-repository";
import styles from "../../home.module.css";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function ProgressDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: routeId } = await params;
  const [kind, id] = splitRouteId(routeId);
  if (!kind || !id) return <UnavailableRecord />;

  const client = await createServerUserClient();
  const plans = new TrainingRecordRepository(client);
  const actuals = new CompletionRepository(client);
  let detail:
    | {
        kind: "plan";
        plan: PlanVersionSnapshot | null;
        completions: CompletionRevision[];
      }
    | {
        kind: "completion";
        history: CompletionHistory | null;
        planned: PlannedSessionSnapshot | null;
      };

  try {
    if (kind === "plan") {
      const [plan, completions] = await Promise.all([
        plans.getPlanVersionSnapshot(id),
        actuals.listCurrentCompletions(),
      ]);
      detail = { kind: "plan", plan, completions };
    } else {
      const history = await actuals.getCompletionHistory(id);
      const planned = history?.current.plannedSessionId
        ? await actuals.getPlannedSessionSnapshot(
            history.current.plannedSessionId,
          )
        : null;
      detail = { kind: "completion", history, planned };
    }
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

  if (detail.kind === "plan") {
    return detail.plan ? (
      <PlanDetail completions={detail.completions} plan={detail.plan} />
    ) : (
      <UnavailableRecord />
    );
  }
  return detail.history ? (
    <CompletionDetail history={detail.history} planned={detail.planned} />
  ) : (
    <UnavailableRecord />
  );
}

function PlanDetail({
  plan,
  completions,
}: {
  plan: PlanVersionSnapshot;
  completions: CompletionRevision[];
}) {
  return (
    <main className={styles.shell} id="main-content">
      <Link className={styles.backLink} href="/home/progress">
        ← Progress
      </Link>
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>Accepted plan / immutable</p>
          <h1>Plan version {plan.version.versionNumber}.</h1>
          <p className={styles.intro}>
            {plan.version.startDate} through {plan.version.endDate} ·{" "}
            {plan.version.timezoneName}
          </p>
        </div>
        <p className={styles.stamp}>{plan.version.dayCount} day horizon</p>
      </header>

      <section className={styles.section} aria-labelledby="sessions-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>Planned versus actual</p>
            <h2 id="sessions-heading">Source sessions</h2>
          </div>
        </div>
        {plan.sessions.length ? (
          <ol className={styles.grid}>
            {plan.sessions.map((session) => {
              const linked = completions.filter(
                (completion) => completion.plannedSessionId === session.id,
              );
              return (
                <li className={styles.separation} key={session.id}>
                  <section
                    className={styles.ledgerPanel}
                    aria-labelledby={`planned-${session.id}`}
                  >
                    <p className={styles.kicker}>Planned</p>
                    <h2 id={`planned-${session.id}`}>{session.title}</h2>
                    <dl className={styles.facts}>
                      <Fact label="Date" value={session.localDate} />
                      <Fact label="Sport" value={session.sport} />
                      <Fact
                        label="Expected"
                        value={
                          session.expectedDurationMinutes === null
                            ? "Not recorded"
                            : `${session.expectedDurationMinutes} min`
                        }
                      />
                    </dl>
                    <p className={styles.bodyCopy}>
                      {session.intent ?? "No intent recorded."}
                    </p>
                    {session.activities.length ? (
                      <ul className={styles.activityList}>
                        {session.activities.map((activity) => (
                          <li key={activity.id}>
                            <strong>{activity.name}</strong> · {activity.sport}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.bodyCopy}>
                        No planned activity details.
                      </p>
                    )}
                  </section>
                  <section
                    className={styles.ledgerPanel}
                    aria-labelledby={`actual-${session.id}`}
                  >
                    <p className={styles.kicker}>Actual</p>
                    <h2 id={`actual-${session.id}`}>
                      {linked.length ? "Recorded facts" : "Not logged"}
                    </h2>
                    {linked.length ? (
                      <ul className={styles.revisionList}>
                        {linked.map((actual) => (
                          <li key={actual.completionGroupId}>
                            <strong>
                              {completionStatusLabel(actual.status)}
                            </strong>
                            <p>
                              {actual.actualLocalDate}
                              {actual.durationMinutes === undefined
                                ? ""
                                : ` · ${actual.durationMinutes} min`}
                            </p>
                            <Link
                              className={styles.secondaryAction}
                              href={`/home/progress/completion-${actual.completionGroupId}`}
                            >
                              Open actual and corrections
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.bodyCopy}>
                        Time passing does not mark this session complete.
                      </p>
                    )}
                  </section>
                </li>
              );
            })}
          </ol>
        ) : (
          <section className={styles.empty}>
            <h2>No sessions in this accepted version.</h2>
            <p>The saved horizon remains a factual plan record.</p>
          </section>
        )}
      </section>
    </main>
  );
}

function CompletionDetail({
  history,
  planned,
}: {
  history: CompletionHistory;
  planned: PlannedSessionSnapshot | null;
}) {
  const current = history.current;
  return (
    <main className={styles.shell} id="main-content">
      <Link className={styles.backLink} href="/home/progress">
        ← Progress
      </Link>
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>Factual training record</p>
          <h1>{completionStatusLabel(current.status)}.</h1>
          <p className={styles.intro}>
            Current fact and every prior correction remain visible. The source
            plan is unchanged.
          </p>
        </div>
        <p className={styles.stamp}>
          Revision {current.revisionNumber} · current
        </p>
      </header>

      <section
        className={`${styles.section} ${styles.separation}`}
        aria-label="Planned and actual comparison"
      >
        <section className={styles.ledgerPanel} aria-labelledby="planned-title">
          <p className={styles.kicker}>01 / Planned</p>
          <h2 id="planned-title">{planned?.title ?? "No source plan"}</h2>
          {planned ? (
            <>
              <dl className={styles.facts}>
                <Fact label="Date" value={planned.localDate} />
                <Fact label="Sport" value={planned.sport} />
                <Fact
                  label="Expected"
                  value={
                    planned.expectedDurationMinutes === null
                      ? "Not recorded"
                      : `${planned.expectedDurationMinutes} min`
                  }
                />
              </dl>
              <p className={styles.bodyCopy}>
                {planned.intent ?? "No intent recorded."}
              </p>
              <ul className={styles.activityList}>
                {planned.activities.map((activity) => (
                  <li key={activity.id}>
                    <strong>{activity.name}</strong> · {activity.sport}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.bodyCopy}>
              This is unplanned training. No plan was created or changed.
            </p>
          )}
        </section>

        <section className={styles.ledgerPanel} aria-labelledby="actual-title">
          <p className={styles.kicker}>02 / Actual</p>
          <h2 id="actual-title">{completionStatusLabel(current.status)}</h2>
          <CompletionFacts completion={current} />
          <div className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={`/home/log?completion=${current.completionGroupId}`}
            >
              Correct actual
            </Link>
          </div>
        </section>
      </section>

      <section className={styles.section} aria-labelledby="corrections-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionLabel}>03 / Nothing erased</p>
            <h2 id="corrections-heading">Revision history</h2>
          </div>
        </div>
        <ol className={styles.revisionList}>
          {history.revisions.map((revision) => (
            <li key={revision.id}>
              <div className={styles.cardHeader}>
                <h3>Revision {revision.revisionNumber}</h3>
                <span className={styles.status}>
                  {revision.id === current.id
                    ? "Current fact"
                    : "Preserved prior fact"}
                </span>
              </div>
              <CompletionFacts completion={revision} />
              {revision.correctionReason ? (
                <p>
                  <strong>Correction reason:</strong>{" "}
                  {revision.correctionReason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function CompletionFacts({ completion }: { completion: CompletionRevision }) {
  const signals = [
    completion.painReported ? "Pain" : null,
    completion.illnessReported ? "Illness" : null,
    completion.injuryReported ? "Injury" : null,
    completion.severeFatigueReported ? "Severe fatigue" : null,
  ].filter((value): value is string => value !== null);

  return (
    <>
      <dl className={styles.facts}>
        <Fact label="Date" value={completion.actualLocalDate} />
        <Fact
          label="Duration"
          value={
            completion.durationMinutes === undefined
              ? "Not recorded"
              : `${completion.durationMinutes} min`
          }
        />
        <Fact
          label="Effort"
          value={
            completion.perceivedEffort === undefined
              ? "Not recorded"
              : `${completion.perceivedEffort} / 10`
          }
        />
        <Fact
          label="Feeling"
          value={completion.feeling?.replaceAll("_", " ") ?? "Not recorded"}
        />
        <Fact
          label="Signals"
          value={signals.length ? signals.join(", ") : "None recorded"}
        />
        <Fact
          label="Replacement"
          value={completion.replacementDescription ?? "Not applicable"}
        />
      </dl>
      <p className={styles.bodyCopy}>
        <strong>Private note:</strong> {completion.note ?? "Not recorded"}
      </p>
      {completion.activities.length ? (
        <ul className={styles.activityList}>
          {completion.activities.map((activity) => (
            <li key={activity.id}>
              <strong>{activity.name}</strong> · {activity.sport}
              <br />
              {activity.actualMeasurement === undefined
                ? "Result not recorded"
                : JSON.stringify(activity.actualMeasurement)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.bodyCopy}>No activity results.</p>
      )}
    </>
  );
}

function UnavailableRecord() {
  return (
    <main className={styles.shell} id="main-content">
      <section className={styles.stateCard} role="alert">
        <p className={styles.kicker}>Record unavailable</p>
        <h1>This private record was not found.</h1>
        <p>
          It may not exist or may not belong to this account. No record details
          are exposed.
        </p>
        <Link className={styles.primaryAction} href="/home/progress">
          Return to Progress
        </Link>
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

function splitRouteId(value: string): ["plan" | "completion" | null, string] {
  for (const kind of ["plan", "completion"] as const) {
    const prefix = `${kind}-`;
    if (value.startsWith(prefix)) {
      const id = value.slice(prefix.length);
      return [UUID.test(id) ? kind : null, id];
    }
  }
  return [null, ""];
}
