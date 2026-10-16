"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { deleteLogAction } from "./actions";
import { INITIAL_DELETE_LOG_STATE } from "./log-action-state";
import styles from "./log.module.css";

/**
 * "Delete log" on a log being edited (ADR-031; owner, 16 Oct 2026). Nothing
 * is deleted until the dialog is answered, and the dialog names everything
 * that goes: this log, and any planned log "Replaced" by it. A delete cannot
 * be undone, so the dialog opens on "Keep it".
 *
 * Its own form beside the edit form, so a delete never sends what the edit
 * holds, and the edit's Save never sends a delete.
 */
export function DeleteLog({
  completionId,
  revision,
  name,
  day,
  leaveTo,
  planned,
  replaces,
}: {
  completionId: string;
  /** The revision the owner read: a log changed since is refused. */
  revision: number;
  name: string;
  /** The log's day, as the form writes it. */
  day: string;
  /** Where it leaves for: back where the log was opened from. */
  leaveTo: string;
  /** The planned session the log answers, which it frees; null if none. */
  planned: string | null;
  /** The planned sessions logged "Replaced" by this one, by name. */
  replaces: readonly string[];
}) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(
    deleteLogAction,
    INITIAL_DELETE_LOG_STATE,
  );
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Focus goes back to "Delete log" when the dialog closes without deleting.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) opener.current?.focus();
    asked.current = asking;
  }, [asking]);

  const close = () => {
    if (!pending) setAsking(false);
  };

  return (
    <>
      <button
        className={styles.deleteLink}
        onClick={() => setAsking(true)}
        ref={opener}
        type="button"
        data-log-delete
      >
        Delete log
      </button>
      {asking ? (
        <div
          className={styles.dialogBackdrop}
          onClick={close}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            // Tab stays among the dialog's own buttons; the form behind it
            // is still in the page and must not take focus while it asks.
            if (event.key !== "Tab") return;
            const buttons = Array.from(
              panel.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? [],
            );
            if (buttons.length === 0) return;
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            const inside = buttons.includes(
              document.activeElement as HTMLButtonElement,
            );
            if (
              event.shiftKey &&
              (!inside || document.activeElement === first)
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              (!inside || document.activeElement === last)
            ) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div
            aria-describedby="delete-log-what"
            aria-labelledby="delete-log-title"
            aria-modal="true"
            className={styles.dialogPanel}
            onClick={(event) => event.stopPropagation()}
            ref={panel}
            role="alertdialog"
            tabIndex={-1}
            data-log-delete-dialog
          >
            <strong id="delete-log-title">Delete this log?</strong>
            <div id="delete-log-what">
              <p>
                This deletes the log of {name} on {day}. It cannot be undone.
              </p>
              {planned === null ? null : (
                <p>
                  The planned session {planned} is no longer logged, and can be
                  changed or planned over again.
                </p>
              )}
              {replaces.length === 0 ? null : (
                <p data-log-delete-replaces>
                  It also deletes the Replaced{" "}
                  {replaces.length === 1 ? "log" : "logs"} of{" "}
                  {listPhrase(replaces)}, which{" "}
                  {replaces.length === 1 ? "points" : "point"} to it. That frees{" "}
                  {replaces.length === 1 ? "that session" : "those sessions"}{" "}
                  too.
                </p>
              )}
            </div>
            {state.status === "idle" ? null : (
              <div className={styles.dialogError} role="alert">
                <p>{state.message}</p>
                {/* The recovery the message asks for, here rather than only
                    named: a reload reads the log as it is now. */}
                {state.status === "session" ? (
                  <Link href="/">Sign in</Link>
                ) : (
                  <button
                    className={styles.secondary}
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    Reload
                  </button>
                )}
              </div>
            )}
            <form action={action}>
              <input type="hidden" name="completionId" value={completionId} />
              <input type="hidden" name="expectedRevision" value={revision} />
              <input type="hidden" name="leaveTo" value={leaveTo} />
              <button
                autoFocus
                className={styles.secondary}
                disabled={pending}
                onClick={close}
                type="button"
              >
                Keep it
              </button>
              <button
                className={styles.danger}
                disabled={pending}
                type="submit"
              >
                {pending ? "Deleting…" : "Delete log"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function listPhrase(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
