import styles from "@/app/home/plan/proposal/proposal.module.css";
import type { SevenDayPlanProposal } from "@/server/ai/contracts";

export function PlanProposalDays({
  proposal,
  goalTitles,
}: {
  proposal: SevenDayPlanProposal;
  goalTitles: Record<string, string>;
}) {
  const byDate = new Map<string, SevenDayPlanProposal["sessions"]>();
  for (const session of proposal.sessions) {
    const sessions = byDate.get(session.date) ?? [];
    sessions.push(session);
    byDate.set(session.date, sessions);
  }

  return (
    <div className={styles.dayStack}>
      {calendarDates(proposal.startDate, proposal.endDate).map(
        (date, index) => {
          const sessions = byDate.get(date) ?? [];
          return (
            <section
              className={styles.dayCard}
              key={date}
              aria-labelledby={`day-${date}`}
            >
              <header className={styles.dayHeader}>
                <p className={styles.dayIndex}>
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div>
                  <h2 id={`day-${date}`}>{formatPlanDate(date)}</h2>
                  <p>
                    {sessions.length === 0
                      ? "Planned rest"
                      : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </header>
              {sessions.length === 0 ? (
                <p className={styles.restDay}>
                  No session planned. This is an explicit rest day.
                </p>
              ) : (
                <div className={styles.sessions}>
                  {sessions.map((session) => (
                    <article
                      className={styles.sessionCard}
                      key={`${date}-${session.title}`}
                    >
                      <h3>{session.title}</h3>
                      <p className={styles.sessionMeta}>
                        {session.sport} · {session.durationMinutes} min
                      </p>
                      <p className={styles.primaryGoal}>
                        Primary ·{" "}
                        {goalTitles[session.primaryGoalId] ?? "Active goal"}
                      </p>
                      <details className={styles.sessionDetails}>
                        <summary>Focus, reasoning and alternatives</summary>
                        <dl>
                          <div>
                            <dt>Focus</dt>
                            <dd>{session.focus}</dd>
                          </div>
                          <div>
                            <dt>Intent</dt>
                            <dd>{session.intent}</dd>
                          </div>
                          <div>
                            <dt>Why this fits</dt>
                            <dd>{session.rationale}</dd>
                          </div>
                          {session.secondaryGoalIds?.length ? (
                            <div>
                              <dt>Also supports</dt>
                              <dd>
                                {session.secondaryGoalIds
                                  .map((id) => goalTitles[id] ?? "Active goal")
                                  .join(", ")}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {session.alternatives?.length ? (
                          <div className={styles.alternatives}>
                            <h4>Alternatives</h4>
                            <ul>
                              {session.alternatives.map((alternative) => (
                                <li key={alternative.title}>
                                  <strong>{alternative.title}</strong> —{" "}
                                  {alternative.whenToChoose}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        },
      )}
    </div>
  );
}

function calendarDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
