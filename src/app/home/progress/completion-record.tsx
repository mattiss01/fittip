import styles from "./progress.module.css";
import {
  longDay,
  RecordedFacts,
  type ProgressCompletionView,
} from "./progress-record";

import { COMPLETION_OUTCOME_LABELS } from "../log/log-action-state";

/** One planned activity, already reduced to the words this page prints. */
export type PlannedActivityView = {
  position: number;
  name: string;
  sport: string;
  instructions: string | null;
  /** What the plan asked for, or `null` when it asked for nothing. */
  target: string | null;
};

/**
 * The planned session as it stood when the completion was written. It is the
 * completion's own stored copy, never a read through to the live plan row, so
 * changing the plan afterwards cannot change what this says.
 */
export type PlannedSnapshotView = {
  localDate: string;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  isLocked: boolean;
  status: "active" | "cancelled";
  isRecurring: boolean;
  activities: PlannedActivityView[];
};

type Props = {
  completion: ProgressCompletionView;
  /** The zone the completion's date was anchored in when it was written. */
  timezoneName: string;
  planned: PlannedSnapshotView | null;
};

/**
 * One completion beside the plan it was measured against. The two are drawn as
 * two different kinds of paper on purpose: what happened is a fact the owner
 * wrote, and what was planned is a copy taken at the time. Neither is scored
 * against the other, and nothing here is computed from the pair.
 */
export function CompletionRecord({ completion, timezoneName, planned }: Props) {
  return (
    <div className={styles.sheets}>
      <section className={styles.sheet} data-progress-sheet="recorded">
        <p className={styles.sheetLabel}>What you recorded</p>
        <div className={styles.sheetHeader}>
          <h2>{completion.title ?? "Unplanned training"}</h2>
          <span className={styles.stamp} data-outcome={completion.outcome}>
            {COMPLETION_OUTCOME_LABELS[completion.outcome]}
          </span>
        </div>
        {completion.sport === null ? null : (
          <div className={styles.marks}>
            <span>{completion.sport}</span>
          </div>
        )}
        <dl className={styles.facts}>
          <div>
            <dt>Logged for</dt>
            <dd>{longDay(completion.actualLocalDate)}</dd>
          </div>
          <div>
            <dt>Recorded in</dt>
            <dd>{timezoneName}</dd>
          </div>
        </dl>
        <RecordedFacts completion={completion} />
      </section>

      {planned === null ? (
        <section
          className={`${styles.sheet} ${styles.carbon}`}
          data-progress-sheet="unplanned"
        >
          <p className={styles.sheetLabel}>What was planned</p>
          <h2>This training was not planned.</h2>
          <p className={styles.carbonNote}>
            You logged it without a planned session, so there is no copy of a
            plan to set it beside. The record above is the whole of it.
          </p>
        </section>
      ) : (
        <section
          className={`${styles.sheet} ${styles.carbon}`}
          data-progress-sheet="planned"
        >
          <p className={styles.carbonMark}>Carbon copy</p>
          <p className={styles.sheetLabel}>What was planned</p>
          <h2>{planned.title}</h2>
          <div className={styles.marks}>
            <span>{planned.sport}</span>
            {planned.isRecurring ? <span>Recurring</span> : null}
            {planned.isLocked ? <span>Locked</span> : null}
            {planned.status === "cancelled" ? (
              <span>Cancelled, kept on the record</span>
            ) : null}
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Planned for</dt>
              <dd>{longDay(planned.localDate)}</dd>
            </div>
            {planned.expectedDurationMinutes === null ? null : (
              <div>
                <dt>Expected</dt>
                <dd>{planned.expectedDurationMinutes} min</dd>
              </div>
            )}
          </dl>
          {planned.intent === null ? null : (
            <p className={styles.body}>{planned.intent}</p>
          )}
          {planned.note === null ? null : (
            <p className={styles.body}>{planned.note}</p>
          )}
          {planned.activities.length === 0 ? null : (
            <ol className={styles.activities} data-progress-planned-activities>
              {planned.activities.map((activity) => (
                <li className={styles.activity} key={activity.position}>
                  <p className={styles.activityName}>{activity.name}</p>
                  <p className={styles.activityMeta}>
                    {[activity.sport, activity.target]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {activity.instructions === null ? null : (
                    <p className={styles.activityNote}>
                      {activity.instructions}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className={styles.carbonNote}>
            This is the plan as it stood when you logged this session. Editing
            the plan now does not change this copy.
          </p>
        </section>
      )}
    </div>
  );
}
