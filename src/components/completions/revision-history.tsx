import type { CompletionHistory } from "@/features/completions/completion-types";
import styles from "@/app/home/log/log.module.css";

export function RevisionHistory({ history }: { history: CompletionHistory }) {
  return (
    <section className={styles.history} aria-labelledby="history-heading">
      <p className={styles.sectionNumber}>03 / Revision history</p>
      <h2 id="history-heading">Nothing erased.</h2>
      <ol>
        {history.revisions.map((revision) => {
          const signals = [
            revision.painReported ? "Pain" : null,
            revision.illnessReported ? "Illness" : null,
            revision.injuryReported ? "Injury" : null,
            revision.severeFatigueReported ? "Severe fatigue" : null,
          ].filter(Boolean);

          return (
            <li key={revision.id}>
              <header className={styles.revisionHeader}>
                <strong>Revision {revision.revisionNumber}</strong>
                {revision.id === history.current.id ? (
                  <span>Current fact</span>
                ) : (
                  <span>Preserved prior fact</span>
                )}
              </header>
              <dl className={styles.revisionFacts}>
                <Fact
                  label="Outcome"
                  value={revision.status.replaceAll("_", " ")}
                />
                <Fact label="Local date" value={revision.actualLocalDate} />
                <Fact
                  label="Started"
                  value={revision.actualStartedAt ?? "Not recorded"}
                />
                <Fact
                  label="Duration"
                  value={
                    revision.durationMinutes === undefined
                      ? "Not recorded"
                      : `${revision.durationMinutes} min`
                  }
                />
                <Fact
                  label="Effort"
                  value={
                    revision.perceivedEffort === undefined
                      ? "Not recorded"
                      : `${revision.perceivedEffort} / 10`
                  }
                />
                <Fact
                  label="Feeling"
                  value={
                    revision.feeling?.replaceAll("_", " ") ?? "Not recorded"
                  }
                />
                <Fact
                  label="Replacement"
                  value={revision.replacementDescription ?? "Not applicable"}
                />
                <Fact
                  label="Signals"
                  value={signals.length ? signals.join(", ") : "None recorded"}
                />
              </dl>
              <div className={styles.revisionText}>
                <strong>Private note</strong>
                <p>{revision.note ?? "Not recorded"}</p>
              </div>
              <div className={styles.revisionText}>
                <strong>Activity results</strong>
                {revision.activities.length ? (
                  <ul>
                    {revision.activities.map((activity) => (
                      <li key={activity.id}>
                        <span>
                          {activity.name} · {activity.sport} ·{" "}
                          {activity.measurementMode.replaceAll("_", " ")}
                        </span>
                        <code>
                          {activity.actualMeasurement === undefined
                            ? "Not recorded"
                            : JSON.stringify(activity.actualMeasurement)}
                        </code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No activity results.</p>
                )}
              </div>
              {revision.correctionReason ? (
                <div className={styles.correctionReason}>
                  <strong>Correction reason</strong>
                  <p>{revision.correctionReason}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
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
