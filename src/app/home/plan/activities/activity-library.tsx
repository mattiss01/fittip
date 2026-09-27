"use client";

import { useActionState, useState } from "react";

import {
  INITIAL_ACTIVITY_LIBRARY_ACTION_STATE,
  type ActivityLibraryActionState,
} from "./action-state";
import { changeActivityLibraryAction } from "./actions";

import styles from "../saved/saved.module.css";
import {
  ActivityDefinitionEditor,
  type ActivityDefinitionValue,
} from "@/components/training/activity-definition-editor";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import { MEASUREMENT_MODE_COPY } from "@/lib/training/measurement-copy";

export type PersonalActivityView = ActivityDefinitionValue & {
  id: string;
  /** Sent back with an edit or an archive, which refuses a stale one. */
  updatedAt: string;
};

type FormAction = (formData: FormData) => void;

export function ActivityLibrary({
  activities,
}: {
  activities: PersonalActivityView[];
}) {
  const [state, action, pending] = useActionState(
    changeActivityLibraryAction,
    INITIAL_ACTIVITY_LIBRARY_ACTION_STATE,
  );
  const createKey = useSavedKey(state, "create");
  const noticeState = pending ? "pending" : state.status;

  return (
    <div className={styles.library}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving change…" : state.message}
      </p>
      {state.status === "conflict" ? (
        <a className={styles.reload} href="/home/plan/activities">
          Reload your activities
        </a>
      ) : null}

      <details
        className={styles.disclosure}
        // Closed again once the new activity is in the list below it.
        key={`create-${createKey}`}
        open={createKey === 0 && activities.length === 0 ? true : undefined}
      >
        <summary>New activity</summary>
        <form className={styles.form} action={action}>
          <input type="hidden" name="operation" value="create" />
          <ActivityDefinitionEditor idPrefix="create" />
          <button className={styles.primary} type="submit" disabled={pending}>
            Add to your activities
          </button>
        </form>
      </details>

      {activities.length === 0 ? (
        <section className={styles.empty}>
          <h2>No activities yet.</h2>
          <p>
            Add the ones you do often — a squat, an interval set, a serve drill
            — with the target you usually give them. Then add them to a session
            from its editor instead of typing them again.
          </p>
        </section>
      ) : (
        <ol className={styles.cards}>
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              action={action}
              state={state}
              pending={pending}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
  action,
  state,
  pending,
}: {
  activity: PersonalActivityView;
  action: FormAction;
  state: ActivityLibraryActionState;
  pending: boolean;
}) {
  const target = describeMeasurement(activity.target);

  return (
    <li className={styles.card}>
      <p className={styles.tab}>{activity.name}</p>
      <div className={styles.cardBody}>
        <p className={styles.meta}>
          {activity.sport} ·{" "}
          {MEASUREMENT_MODE_COPY[activity.measurementMode].label}
        </p>
        {target === null ? null : <p className={styles.body}>{target}</p>}
        {activity.instructions === null ? null : (
          <p className={styles.body}>{activity.instructions}</p>
        )}

        <details
          className={styles.disclosure}
          // The edit form is re-seeded from the saved values after its own
          // save, and left as typed after a refusal.
          key={`edit-${activity.id}-${activity.updatedAt}`}
        >
          <summary>Edit</summary>
          <form className={styles.form} action={action}>
            <input type="hidden" name="operation" value="edit" />
            <input
              type="hidden"
              name="personalActivityId"
              value={activity.id}
            />
            <input
              type="hidden"
              name="expectedUpdatedAt"
              value={activity.updatedAt}
            />
            <ActivityDefinitionEditor
              idPrefix={`edit-${activity.id}`}
              initial={activity}
            />
            <p className={styles.consequence}>
              Only what you add from now on uses the new values. Sessions and
              logs that already hold this activity stay exactly as they are.
            </p>
            <button className={styles.primary} type="submit" disabled={pending}>
              Save activity
            </button>
          </form>
        </details>

        <details className={styles.disclosure}>
          <summary>Remove from library</summary>
          <p className={styles.consequence}>
            It leaves your library and can no longer be added to a session.
            There is no undo here: to have it again, save it from a session that
            holds it. Sessions and logs that already hold it keep it.
          </p>
          <form className={styles.form} action={action}>
            <input type="hidden" name="operation" value="archive" />
            <input
              type="hidden"
              name="personalActivityId"
              value={activity.id}
            />
            <input
              type="hidden"
              name="expectedUpdatedAt"
              value={activity.updatedAt}
            />
            <button className={styles.action} type="submit" disabled={pending}>
              Remove from library
            </button>
          </form>
          {state.operation === "archive" &&
          state.personalActivityId === activity.id &&
          state.status !== "saved" ? (
            <p className={styles.inlineNotice}>{state.message}</p>
          ) : null}
        </details>
      </div>
    </li>
  );
}

/**
 * A remount key that advances only when `operation` was saved, so the create
 * form empties after a success and keeps what was typed after a refusal.
 * Adjusted during render, as `useTargetedResetKey` in the saved library is.
 */
function useSavedKey(
  state: ActivityLibraryActionState,
  operation: ActivityLibraryActionState["operation"],
): number {
  const [seen, setSeen] = useState(0);
  const saved = state.status === "saved" && state.operation === operation;
  if (saved && state.submission !== seen) setSeen(state.submission);
  return saved ? state.submission : seen;
}
