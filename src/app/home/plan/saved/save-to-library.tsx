"use client";

import { useActionState } from "react";

import { INITIAL_LIBRARY_SAVE_ACTION_STATE } from "./action-state";
import { saveLogToLibraryAction, saveSessionToLibraryAction } from "./actions";
import styles from "./saved.module.css";

/**
 * The save entry point, rendered inside a planned session on the Plan, and on
 * a log's receipt and Progress record. It holds its own action state so one
 * card's result never disturbs another, and so saving never touches the Plan's
 * or the log's own change machinery.
 */
export function SaveToLibrary({
  sessionId,
  completionId,
  defaultName,
  bare = false,
}: {
  defaultName: string;
  /**
   * The form alone, for a caller that already gives it a heading and a way
   * to close it: the session page opens it from its menu.
   */
  bare?: boolean;
} & (
  | { sessionId: string; completionId?: never }
  | { completionId: string; sessionId?: never }
)) {
  const fromLog = completionId !== undefined;
  const [state, action, pending] = useActionState(
    fromLog ? saveLogToLibraryAction : saveSessionToLibraryAction,
    INITIAL_LIBRARY_SAVE_ACTION_STATE,
  );
  const id = completionId ?? sessionId;

  const form = (
    <form
      className={styles.form}
      action={action}
      key={`save-${id}-${state.submission}`}
    >
      {fromLog ? (
        <input type="hidden" name="completionId" value={completionId} />
      ) : (
        <input type="hidden" name="sessionId" value={sessionId} />
      )}
      <div className={styles.field}>
        <label htmlFor={`save-${id}-name`}>Name it</label>
        <input
          id={`save-${id}-name`}
          name="name"
          maxLength={120}
          required
          defaultValue={
            state.status === "saved" ? defaultName : (state.name ?? defaultName)
          }
        />
      </div>
      <p className={styles.consequence}>
        {fromLog
          ? "A copy goes to your saved sessions, with what you did as its targets. This log stays as it is, and the copy will not follow later edits."
          : "A copy goes to your saved sessions. This session stays on your plan, unchanged, and the copy will not follow later edits."}
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
  );

  return bare ? (
    <div className={styles.planPanel}>{form}</div>
  ) : (
    <details className={styles.planDisclosure}>
      <summary>
        {fromLog ? "Save session to library" : "Save to library"}
      </summary>
      {form}
    </details>
  );
}
