"use client";

import { useActionState } from "react";

import { INITIAL_LIBRARY_SAVE_ACTION_STATE } from "./action-state";
import { saveSessionToLibraryAction } from "./actions";
import styles from "./saved.module.css";

/**
 * The save entry point, rendered inside a planned session on the Plan. It
 * holds its own action state so one card's result never disturbs another, and
 * so saving never touches the Plan's own change machinery.
 */
export function SaveToLibrary({
  sessionId,
  defaultName,
}: {
  sessionId: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState(
    saveSessionToLibraryAction,
    INITIAL_LIBRARY_SAVE_ACTION_STATE,
  );

  return (
    <details className={styles.planDisclosure}>
      <summary>Save to library</summary>
      <form
        className={styles.form}
        action={action}
        key={`save-${sessionId}-${state.submission}`}
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <div className={styles.field}>
          <label htmlFor={`save-${sessionId}-name`}>Name it</label>
          <input
            id={`save-${sessionId}-name`}
            name="name"
            maxLength={120}
            required
            defaultValue={
              state.status === "saved"
                ? defaultName
                : (state.name ?? defaultName)
            }
          />
        </div>
        <p className={styles.consequence}>
          A copy goes to your saved sessions. This session stays on your plan,
          unchanged, and the copy will not follow later edits.
        </p>
        <button className={styles.primary} type="submit" disabled={pending}>
          Save to library
        </button>
        <p
          className={
            state.status === "idle" ? styles.srOnly : styles.inlineNotice
          }
          data-state={pending ? "pending" : state.status}
          role="status"
          aria-live="polite"
        >
          {pending ? "Saving to your library…" : state.message}
        </p>
      </form>
    </details>
  );
}
