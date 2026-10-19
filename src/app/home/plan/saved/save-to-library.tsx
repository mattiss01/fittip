"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

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
  bare = false,
  immediate = false,
}: {
  /**
   * Saves as soon as it is shown (owner, 19 Oct 2026): the session page's ⋯
   * opens it, and that choice is the save. Only a title already in the
   * library asks anything.
   */
  immediate?: boolean;
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
  // A title already in the library asks first (owner, 15 Oct 2026): update
  // that entry, or keep both under another title.
  const exists = state.status === "exists";
  // Once chosen, "Keep both" stays open while its title is taken too, and
  // closes with any other answer.
  const [keepBoth, setKeepBoth] = useState(false);
  if (keepBoth && !exists && !pending) setKeepBoth(false);
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (!immediate || sent.current) return;
    sent.current = true;
    formRef.current?.requestSubmit();
  }, [immediate]);

  const form = (
    <form
      ref={formRef}
      className={styles.form}
      action={action}
      key={`save-${id}-${state.submission}`}
    >
      {fromLog ? (
        <input type="hidden" name="completionId" value={completionId} />
      ) : (
        <input type="hidden" name="sessionId" value={sessionId} />
      )}
      {/* No name to give: an entry is called what the session is called
          (owner, 2 Oct 2026). */}
      {immediate ? null : (
        <p className={styles.consequence}>
          {fromLog
            ? "A copy goes to your saved sessions, with what you did as its targets. This log stays as it is, and the copy will not follow later edits."
            : "A copy goes to your saved sessions. This session stays on your plan, unchanged, and the copy will not follow later edits."}
        </p>
      )}
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
      {exists ? (
        keepBoth ? (
          <>
            <label htmlFor={titleId}>Title for the new entry</label>
            {/* Opened by a tap on "Keep both", so it takes the focus. */}
            <input
              autoFocus
              defaultValue={state.suggestedTitle}
              id={titleId}
              maxLength={120}
              name="title"
              required
              type="text"
            />
            <button
              className={styles.primary}
              type="submit"
              name="onExisting"
              value="new"
              disabled={pending}
            >
              Save as new entry
            </button>
          </>
        ) : (
          <div className={styles.existsChoices}>
            <button
              className={styles.primary}
              type="submit"
              name="onExisting"
              value="update"
              disabled={pending}
            >
              Update it
            </button>
            <button
              className={styles.action}
              type="button"
              disabled={pending}
              onClick={() => setKeepBoth(true)}
            >
              Keep both
            </button>
          </div>
        )
      ) : immediate ? null : (
        <button className={styles.primary} type="submit" disabled={pending}>
          Save to library
        </button>
      )}
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
