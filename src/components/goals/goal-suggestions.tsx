"use client";

import { useActionState } from "react";

import styles from "./goal-suggestions.module.css";

import { INITIAL_GOAL_SUGGESTION_ACTION_STATE } from "@/app/home/you/goals/suggestion-action-state";
import { decideGoalSuggestionAction } from "@/app/home/you/goals/suggestion-actions";

/** A goal the coach suggested from a planning note, still undecided. */
export type GoalSuggestion = {
  id: string;
  /** The proposal it came from; the pop-up before an ending shows only its own. */
  proposalId?: string | null;
  title: string;
  desiredOutcome: string;
  sports: readonly string[];
  targetDate: string | null;
};

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The coach's goal suggestions (owner, 19 Oct 2026; ADR-034): add one as a
 * core or a supporting goal, reject it, or leave it. Adding creates the goal
 * through the goal rules, so a fourth core goal is refused with the reason.
 * One action for the whole list, as the memory suggestions have: every row
 * names the same goal revision, so one decision at a time.
 */
export function GoalSuggestions({
  suggestions,
  expectedGoalRevision,
}: {
  suggestions: readonly GoalSuggestion[];
  expectedGoalRevision: number;
}) {
  const [state, action, pending] = useActionState(
    decideGoalSuggestionAction,
    INITIAL_GOAL_SUGGESTION_ACTION_STATE,
  );

  if (suggestions.length === 0) {
    return (
      <p className={styles.notice} role="status">
        {state.status === "idle" ? "" : `${state.message} `}All decided.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.id}
            className={styles.item}
            data-goal-suggestion={suggestion.id}
          >
            <p className={styles.title}>{suggestion.title}</p>
            <p className={styles.outcome}>{suggestion.desiredOutcome}</p>
            <p className={styles.meta}>
              {[
                suggestion.sports.join(", "),
                suggestion.targetDate === null
                  ? null
                  : `by ${DATE.format(new Date(`${suggestion.targetDate}T00:00:00Z`))}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <form className={styles.choices} action={action}>
              <input type="hidden" name="suggestionId" value={suggestion.id} />
              <input
                type="hidden"
                name="expectedGoalRevision"
                value={expectedGoalRevision}
              />
              <button
                className={styles.accept}
                type="submit"
                name="choice"
                value="core"
                disabled={pending}
                aria-label={`Add as a core goal: ${suggestion.title}`}
              >
                Add as core
              </button>
              <button
                className={styles.accept}
                type="submit"
                name="choice"
                value="supporting"
                disabled={pending}
                aria-label={`Add as a supporting goal: ${suggestion.title}`}
              >
                Add as supporting
              </button>
              <button
                className={styles.reject}
                type="submit"
                name="choice"
                value="reject"
                disabled={pending}
                aria-label={`Reject: ${suggestion.title}`}
              >
                Reject
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={pending ? "pending" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving…" : state.message}
      </p>
    </>
  );
}
