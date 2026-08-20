"use client";

import { useActionState, useState } from "react";

import {
  INITIAL_LIBRARY_ACTION_STATE,
  type LibraryActionState,
  type LibraryDraft,
} from "./action-state";
import { changeLibraryAction } from "./actions";
import styles from "./saved.module.css";

export type SavedSessionActivityView = {
  position: number;
  name: string;
  sport: string;
};

export type SavedSessionView = {
  id: string;
  revision: number;
  name: string;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  activities: SavedSessionActivityView[];
};

type FormAction = (formData: FormData) => void;

export function SavedLibrary({
  dates,
  planRevision,
  sessions,
}: {
  /** Owner-local dates a reuse may land on, ascending. Empty means none can. */
  dates: string[];
  planRevision: number;
  sessions: SavedSessionView[];
}) {
  const [state, action, pending] = useActionState(
    changeLibraryAction,
    INITIAL_LIBRARY_ACTION_STATE,
  );
  const notice = pending ? "Saving change…" : null;
  const noticeState = pending ? "pending" : state.status;

  return (
    <div className={styles.library}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice ?? state.message}
      </p>
      {state.conflict === "stale" || state.conflict === "timezone" ? (
        <a className={styles.reload} href="/home/plan/saved">
          Reload the library
        </a>
      ) : null}

      {sessions.length === 0 ? (
        <section className={styles.empty}>
          <h2>Nothing saved yet.</h2>
          <p>
            Open a session on your plan and choose{" "}
            <strong>Save to library</strong>. It is copied here, so you can use
            it again on any later date.
          </p>
        </section>
      ) : (
        <ol className={styles.cards}>
          {sessions.map((session) => (
            <SavedSessionCard
              key={session.id}
              session={session}
              dates={dates}
              planRevision={planRevision}
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

function SavedSessionCard({
  session,
  dates,
  planRevision,
  action,
  state,
  pending,
}: {
  session: SavedSessionView;
  dates: string[];
  planRevision: number;
  action: FormAction;
  state: LibraryActionState;
  pending: boolean;
}) {
  const editResetKey = useTargetedResetKey(
    state.submission,
    state.operation === "edit" && state.savedSessionId === session.id,
  );

  return (
    <li className={styles.card}>
      <p className={styles.tab}>{session.name}</p>
      <div className={styles.cardBody}>
        <h2>{session.title}</h2>
        <p className={styles.meta}>
          {[
            session.sport,
            session.expectedDurationMinutes === null
              ? null
              : `${session.expectedDurationMinutes} min`,
            session.activities.length > 0
              ? `${session.activities.length} ${
                  session.activities.length === 1 ? "activity" : "activities"
                }`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {session.intent === null ? null : (
          <p className={styles.body}>{session.intent}</p>
        )}
        {session.note === null ? null : (
          <p className={styles.body}>{session.note}</p>
        )}
        {session.activities.length > 0 ? (
          <ol className={styles.activities}>
            {session.activities.map((activity) => (
              <li key={activity.position}>
                {activity.name} · {activity.sport}
              </li>
            ))}
          </ol>
        ) : null}

        <a
          className={styles.repeatLink}
          href={
            "/home/plan/series/new?source=saved&id=" +
            encodeURIComponent(session.id)
          }
        >
          Repeat
        </a>

        <details className={styles.disclosure}>
          <summary>Use in plan</summary>
          {dates.length === 0 ? (
            <p className={styles.consequence}>
              Confirm your time zone on the plan first. Until then there is no
              date to add this to.
            </p>
          ) : (
            <form className={styles.form} action={action}>
              <input type="hidden" name="operation" value="reuse" />
              <input type="hidden" name="savedSessionId" value={session.id} />
              <input
                type="hidden"
                name="expectedRevision"
                value={planRevision}
              />
              <div className={styles.field}>
                <label htmlFor={`reuse-${session.id}`}>Add to</label>
                <select
                  id={`reuse-${session.id}`}
                  name="localDate"
                  defaultValue={dates[0]}
                >
                  {dates.map((date) => (
                    <option key={date} value={date}>
                      {stampDate(date)}
                    </option>
                  ))}
                </select>
              </div>
              <p className={styles.consequence}>
                The plan gets a new session copied from this entry. It starts
                unlocked, and later changes here will not reach it.
              </p>
              <button
                className={styles.primary}
                type="submit"
                disabled={pending}
              >
                Add to plan
              </button>
            </form>
          )}
        </details>

        <details className={styles.disclosure}>
          <summary>Edit</summary>
          <form
            className={styles.form}
            action={action}
            key={`edit-${session.id}-${editResetKey}`}
          >
            <input type="hidden" name="operation" value="edit" />
            <input type="hidden" name="savedSessionId" value={session.id} />
            <input
              type="hidden"
              name="expectedRevision"
              value={session.revision}
            />
            <SavedSessionFields
              idPrefix={`edit-${session.id}`}
              draft={draftFor(state, session.id) ?? draftOf(session)}
            />
            <p className={styles.consequence}>
              Editing changes this entry only. Sessions already added to your
              plan from it stay exactly as they are.
            </p>
            <button className={styles.primary} type="submit" disabled={pending}>
              Save entry
            </button>
          </form>
        </details>

        <details className={styles.disclosure}>
          <summary>Delete</summary>
          <p className={styles.consequence}>
            Deleting removes this entry permanently. There is no archive and no
            undo. Sessions already added to your plan from it are not affected.
          </p>
          <form className={styles.form} action={action}>
            <input type="hidden" name="operation" value="delete" />
            <input type="hidden" name="savedSessionId" value={session.id} />
            <input
              type="hidden"
              name="expectedRevision"
              value={session.revision}
            />
            <button className={styles.action} type="submit" disabled={pending}>
              Delete permanently
            </button>
          </form>
        </details>
      </div>
    </li>
  );
}

function SavedSessionFields({
  idPrefix,
  draft,
}: {
  idPrefix: string;
  draft?: LibraryDraft;
}) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          maxLength={120}
          required
          defaultValue={draft?.name ?? ""}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          maxLength={120}
          required
          defaultValue={draft?.title ?? ""}
        />
      </div>
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sport`}>Sport</label>
          <input
            id={`${idPrefix}-sport`}
            name="sport"
            maxLength={80}
            required
            defaultValue={draft?.sport ?? ""}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-minutes`}>Minutes</label>
          <input
            id={`${idPrefix}-minutes`}
            name="expectedDurationMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={10080}
            defaultValue={draft?.expectedDurationMinutes ?? ""}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-intent`}>Intent</label>
        <input
          id={`${idPrefix}-intent`}
          name="intent"
          maxLength={500}
          defaultValue={draft?.intent ?? ""}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-note`}>Note</label>
        <textarea
          id={`${idPrefix}-note`}
          name="note"
          maxLength={2000}
          defaultValue={draft?.note ?? ""}
        />
      </div>
    </>
  );
}

/**
 * A remount key that advances only when a submission targeted *this* form, so
 * an accepted edit clears its own form and a refused one is re-seeded from the
 * returned draft, without disturbing any other open form on the surface. The
 * value is adjusted during render, so the remount happens in the same commit
 * as the result that caused it. M3-12 established this shape.
 */
function useTargetedResetKey(submission: number, targeted: boolean): number {
  const [seen, setSeen] = useState(0);
  if (targeted && submission !== seen) setSeen(submission);
  return targeted ? submission : seen;
}

function draftOf(session: SavedSessionView): LibraryDraft {
  return {
    name: session.name,
    title: session.title,
    sport: session.sport,
    intent: session.intent ?? "",
    expectedDurationMinutes:
      session.expectedDurationMinutes === null
        ? ""
        : String(session.expectedDurationMinutes),
    note: session.note ?? "",
  };
}

/** Returns what the owner typed only for the exact form that was refused. */
function draftFor(
  state: LibraryActionState,
  savedSessionId: string,
): LibraryDraft | undefined {
  if (state.operation !== "edit" || !state.draft) return undefined;
  return state.savedSessionId === savedSessionId ? state.draft : undefined;
}

function stampDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}
