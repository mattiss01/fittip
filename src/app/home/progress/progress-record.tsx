import Link from "next/link";

import styles from "./progress.module.css";

import {
  COMPLETION_FEELING_LABELS,
  COMPLETION_SIGNAL_STAMPS,
  type CompletionFeelingValue,
  type CompletionOutcome,
} from "../log/log-action-state";

/**
 * One completion, reduced to what Progress draws. Both the month and the
 * single-completion route render the same facts from this, so a record never
 * says one thing in the list and another on its own page.
 *
 * Nothing here is computed. Every value is something the owner wrote or the
 * plan said, and a value the owner did not write is absent rather than zero.
 */
export type ProgressCompletionView = {
  id: string;
  outcome: CompletionOutcome;
  actualLocalDate: string;
  /**
   * The planned session's title as it stood when the log was written, or the
   * owner's own name for training that was never planned.
   */
  title: string | null;
  sport: string | null;
  /** The date the planned session sat on, which a late log will not match. */
  plannedLocalDate: string | null;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: CompletionFeelingValue | null;
  note: string | null;
  replacementDescription: string | null;
  /**
   * The unplanned log a replaced one points at, already in words. Null on
   * every other outcome and on a replaced log written before the link, which
   * shows its text instead.
   */
  replacedBy: { id: string; label: string } | null;
  /** The planned sessions this unplanned training stood in for, by name. */
  replaces: { id: string; label: string }[];
  /**
   * What was actually done, in the order it was done, already in words. Only
   * the detail page draws it, so only that page builds it.
   */
  activities?: { position: number; name: string; detail: string | null }[];
  pain: boolean;
  illness: boolean;
  injury: boolean;
  severeFatigue: boolean;
};

const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** What the owner recorded, in the same words the log form wrote it with. */
export function RecordedFacts({
  completion,
}: {
  completion: ProgressCompletionView;
}) {
  const signals = COMPLETION_SIGNAL_STAMPS.filter(
    ({ key }) => completion[key],
  ).map(({ label }) => label);

  const facts = [
    completion.durationMinutes === null
      ? null
      : { term: "Duration", value: `${completion.durationMinutes} min` },
    completion.perceivedEffort === null
      ? null
      : { term: "Effort", value: `${completion.perceivedEffort} of 10` },
    completion.feeling === null
      ? null
      : { term: "Felt", value: COMPLETION_FEELING_LABELS[completion.feeling] },
  ].filter((fact): fact is { term: string; value: string } => fact !== null);

  return (
    <div className={styles.record}>
      {facts.length === 0 ? null : (
        <dl className={styles.facts}>
          {facts.map(({ term, value }) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {completion.replaces.length === 0 ? null : (
        <p className={styles.body} data-replaces>
          Instead of:{" "}
          {completion.replaces.map((replaced, index) => (
            <span key={replaced.id}>
              {index === 0 ? null : ", "}
              <Link href={`/home/progress/${replaced.id}`}>
                {replaced.label}
              </Link>
            </span>
          ))}
        </p>
      )}
      {completion.replacedBy !== null ? (
        <p className={styles.body} data-replaced-by>
          Instead:{" "}
          <Link href={`/home/progress/${completion.replacedBy.id}`}>
            {completion.replacedBy.label}
          </Link>
        </p>
      ) : completion.replacementDescription === null ? null : (
        <p className={styles.body}>
          Instead: {completion.replacementDescription}
        </p>
      )}
      {completion.note === null ? null : (
        <p className={styles.body}>{completion.note}</p>
      )}
      {signals.length === 0 ? null : (
        <p className={styles.signals} data-progress-signals>
          You reported: {signals.join(", ")}.
        </p>
      )}
    </div>
  );
}

export function longDay(date: string) {
  return LONG_DAY.format(new Date(`${date}T00:00:00.000Z`));
}
