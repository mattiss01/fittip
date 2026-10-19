"use client";

import { useActionState } from "react";

import styles from "./memory-suggestions.module.css";

import { INITIAL_MEMORY_ACTION_STATE } from "@/app/home/you/memory/action-state";
import { changeMemoryAction } from "@/app/home/you/memory/actions";

/** A memory item the coach proposed from a planning note, still undecided. */
export type MemorySuggestion = {
  id: string;
  memoryType: "profile_fact" | "constraint" | "preference" | "observed_pattern";
  content: string;
};

const TYPE_LABELS: Record<MemorySuggestion["memoryType"], string> = {
  profile_fact: "Fact",
  constraint: "Constraint",
  preference: "Preference",
  observed_pattern: "Observed pattern",
};

/**
 * The coach's memory suggestions, decided where they were made (owner,
 * 19 Oct 2026): Accept or Reject each, or leave it, and it waits on the
 * memory page as before. The write is the memory page's own action, so
 * `apply_memory_change` stays the one way a suggestion is decided (ADR-010);
 * nothing here edits a suggestion's words, which the memory page still does.
 *
 * The action refreshes the page it is called from, which drops a decided
 * suggestion and hands the next one the new collection revision.
 */
export function MemorySuggestions({
  suggestions,
  expectedRevision,
}: {
  suggestions: readonly MemorySuggestion[];
  expectedRevision: number;
}) {
  return (
    <ul className={styles.list}>
      {suggestions.map((suggestion) => (
        <Suggestion
          key={suggestion.id}
          suggestion={suggestion}
          expectedRevision={expectedRevision}
        />
      ))}
    </ul>
  );
}

function Suggestion({
  suggestion,
  expectedRevision,
}: {
  suggestion: MemorySuggestion;
  expectedRevision: number;
}) {
  const [state, action, pending] = useActionState(
    changeMemoryAction,
    INITIAL_MEMORY_ACTION_STATE,
  );

  return (
    <li className={styles.item} data-memory-suggestion={suggestion.id}>
      <p className={styles.type}>{TYPE_LABELS[suggestion.memoryType]}</p>
      <p className={styles.content}>{suggestion.content}</p>
      <form className={styles.choices} action={action}>
        <input type="hidden" name="itemId" value={suggestion.id} />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <button
          className={styles.accept}
          type="submit"
          name="operation"
          value="accept"
          disabled={pending}
          aria-label={`Accept: ${suggestion.content}`}
        >
          Accept
        </button>
        <button
          className={styles.reject}
          type="submit"
          name="operation"
          value="reject"
          disabled={pending}
          aria-label={`Reject: ${suggestion.content}`}
        >
          Reject
        </button>
      </form>
      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={pending ? "pending" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving…" : state.message}
      </p>
    </li>
  );
}
