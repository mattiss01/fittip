"use client";

import { useId, useState } from "react";

import styles from "./saved-session-picker.module.css";

import type { ActivityValue } from "@/lib/training/activity-value";

/** A saved session, as far as starting a new session or log needs it. */
export type SavedSessionOption = {
  id: string;
  name: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  intent: string | null;
  note: string | null;
  activities: ActivityValue[];
};

/**
 * "Use session from library": a button that opens the owner's saved sessions
 * in place, one tap each, as the activity library's picker does (owner, 27 Sep
 * 2026, who preferred it to a select). Picking one hands it to the form, which
 * copies its values by value; nothing links the new session or log back to
 * the entry it started from.
 */
export function SavedSessionPicker({
  sessions,
  picked,
  onPick,
}: {
  sessions: readonly SavedSessionOption[];
  /** The entry the form currently starts from, if any. */
  picked: SavedSessionOption | undefined;
  onPick: (session: SavedSessionOption) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  if (sessions.length === 0) return null;
  return (
    <div className={styles.picker} data-saved-session-picker>
      <button
        className={styles.open}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        Use session from library
      </button>
      {open ? (
        <ul className={styles.list} id={listId} aria-label="Saved sessions">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                className={styles.pick}
                type="button"
                onClick={() => {
                  onPick(session);
                  setOpen(false);
                }}
              >
                <span className={styles.name}>{session.name}</span>
                <span className={styles.detail}>
                  {[
                    session.title,
                    session.sport,
                    session.activities.length === 0
                      ? null
                      : `${session.activities.length} ${
                          session.activities.length === 1
                            ? "activity"
                            : "activities"
                        }`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked === undefined ? null : (
        <p className={styles.started} role="status">
          Started from {picked.name}. Change anything that was different; the
          saved session keeps its own.
        </p>
      )}
    </div>
  );
}
