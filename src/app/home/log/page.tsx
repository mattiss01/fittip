import { redirect } from "next/navigation";

import { QuickLogForm } from "@/components/completions/quick-log-form";
import { RevisionHistory } from "@/components/completions/revision-history";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  CompletionAuthenticationError,
  CompletionRepository,
} from "@/server/repositories/completion-repository";
import styles from "./log.module.css";

export const dynamic = "force-dynamic";

export default async function QuickLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    plannedSession?: string;
    completion?: string;
  }>;
}) {
  const params = await searchParams;
  const repository = new CompletionRepository(await createServerUserClient());

  let history = null;
  let plannedSession = null;
  try {
    await repository.ensureAuthenticated();
    history = params.completion
      ? await repository.getCompletionHistory(params.completion)
      : null;
    const current = history?.current ?? null;
    const plannedId = params.plannedSession ?? current?.plannedSessionId;
    plannedSession = plannedId
      ? await repository.getPlannedSessionSnapshot(plannedId)
      : null;
  } catch (error) {
    if (error instanceof CompletionAuthenticationError) redirect("/");
    throw error;
  }

  if (params.completion && !history) {
    return <NotFoundState message="That actual is not available." />;
  }
  if (params.plannedSession && !plannedSession) {
    return <NotFoundState message="That planned session is not available." />;
  }

  const current = history?.current ?? null;
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.kicker}>FitTip / factual training log</p>
        <h1>{current ? "Correct the record." : "Log what happened."}</h1>
        <p>
          One factual entry. Your accepted plan stays separate and unchanged.
        </p>
      </header>

      <div className={styles.ledger}>
        <section className={styles.planned} aria-labelledby="planned-heading">
          <p className={styles.sectionNumber}>01 / Planned</p>
          <h2 id="planned-heading">
            {plannedSession?.title ?? "No source plan"}
          </h2>
          {plannedSession ? (
            <>
              <dl>
                <div>
                  <dt>Date</dt>
                  <dd>{plannedSession.localDate}</dd>
                </div>
                <div>
                  <dt>Sport</dt>
                  <dd>{plannedSession.sport}</dd>
                </div>
                <div>
                  <dt>Intent</dt>
                  <dd>{plannedSession.intent ?? "Not recorded"}</dd>
                </div>
              </dl>
              {plannedSession.activities.length ? (
                <ul>
                  {plannedSession.activities.map((activity) => (
                    <li key={activity.id}>{activity.name}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p>
              This is unplanned training. No plan record will be created or
              changed.
            </p>
          )}
        </section>

        <section className={styles.actual} aria-labelledby="actual-heading">
          <p className={styles.sectionNumber}>02 / Actual</p>
          <h2 id="actual-heading">
            {current ? `Revision ${current.revisionNumber + 1}` : "New fact"}
          </h2>
          <QuickLogForm
            current={current}
            defaultDate={
              current?.actualLocalDate ??
              plannedSession?.localDate ??
              new Date().toISOString().slice(0, 10)
            }
            deriveBrowserDate={!current && !plannedSession}
            plannedSession={plannedSession}
          />
        </section>
      </div>

      {history && history.revisions.length > 0 ? (
        <RevisionHistory history={history} />
      ) : null}
    </main>
  );
}

function NotFoundState({ message }: { message: string }) {
  return (
    <main className={styles.shell}>
      <section className={styles.saved} role="alert">
        <p className={styles.kicker}>Unavailable</p>
        <h1>Record not found.</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
