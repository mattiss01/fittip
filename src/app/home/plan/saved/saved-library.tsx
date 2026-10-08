"use client";

import { useActionState, useState } from "react";

import {
  INITIAL_LIBRARY_ACTION_STATE,
  type LibraryActionState,
  type LibraryDraft,
} from "./action-state";
import { changeLibraryAction } from "./actions";
import { PlanDateInput, type PlanDateRange } from "../plan-date-field";
import styles from "./saved.module.css";

import { SportInput } from "@/components/sports/sport-input";
import {
  ActivityEditor,
  type ActivityValue,
  type EditorRow,
} from "@/components/training/activity-editor";
import { ActivityList } from "@/components/training/activity-list";
import { describeMeasurement } from "@/lib/training/describe-measurement";

/** In the entry's order; the array index is the position. */
export type SavedSessionActivityView = ActivityValue;

export type SavedSessionView = {
  id: string;
  revision: number;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  note: string | null;
  activities: SavedSessionActivityView[];
};

type FormAction = (formData: FormData) => void;

export function SavedLibrary({
  dateRange,
  planRevision,
  sessions,
}: {
  /** Owner-local dates a reuse may land on. `null` means none can. */
  dateRange: PlanDateRange | null;
  planRevision: number;
  sessions: SavedSessionView[];
}) {
  const [state, action, pending] = useActionState(
    changeLibraryAction,
    INITIAL_LIBRARY_ACTION_STATE,
  );
  const notice = pending ? "Saving change…" : null;
  const noticeState = pending ? "pending" : state.status;
  // "New session" closes and empties once its entry is in the list below it;
  // a refused one stays open with what was typed.
  const created = state.operation === "create";
  const createdKey = useTargetedResetKey(
    state.submission,
    created && state.status === "saved",
  );

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

      {/* A session can be written here, not only saved from the Plan (owner,
          2 Oct 2026). It makes a library entry and nothing else: nothing is in
          the plan until "Use in plan" puts a copy there. */}
      <details
        className={styles.disclosure}
        key={`create-${createdKey}`}
        open={createdKey === 0 && sessions.length === 0 ? true : undefined}
      >
        <summary>New session</summary>
        <NewSavedSession action={action} state={state} pending={pending} />
      </details>

      {sessions.length === 0 ? (
        <section className={styles.empty}>
          <h2>Nothing saved yet</h2>
          <p>
            Write one above, or open a session on your plan and choose{" "}
            <strong>Save to library</strong>. Either way it is kept here, so you
            can use it again on any later date.
          </p>
        </section>
      ) : (
        <ol className={styles.cards}>
          {sessions.map((session) => (
            <SavedSessionCard
              key={session.id}
              session={session}
              dateRange={dateRange}
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
  dateRange,
  planRevision,
  action,
  state,
  pending,
}: {
  session: SavedSessionView;
  dateRange: PlanDateRange | null;
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
        <ActivityList
          label="Activities"
          items={session.activities.map((activity, index) => ({
            key: String(index),
            name: activity.name,
            detail: describeMeasurement(activity.target),
          }))}
        />

        <details className={styles.disclosure}>
          <summary>Use in plan</summary>
          {dateRange === null ? (
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
              <PlanDateInput
                label="Add to"
                range={dateRange}
                defaultValue={dateRange.first}
              />
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
            {/* The whole list is submitted, so saving replaces it (A6). */}
            <ActivityEditor
              idPrefix={`edit-${session.id}`}
              initial={session.activities}
              sessionSport={session.sport}
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

        <details className={styles.disclosure} data-danger>
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

/**
 * The "New session" form. A refusal remounts the form to seed it with what
 * was typed, as an edit does, and three things must outlive that remount, so
 * they are held here above it: the refused draft, which the next action on
 * any card would otherwise replace; the activity rows, which the draft does
 * not carry; and the sport, which a new row starts from.
 */
function NewSavedSession({
  action,
  state,
  pending,
}: {
  action: FormAction;
  state: LibraryActionState;
  pending: boolean;
}) {
  const [refused, setRefused] = useState<{
    submission: number;
    draft?: LibraryDraft;
  }>({ submission: 0 });
  if (state.operation === "create" && state.submission !== refused.submission) {
    setRefused({ submission: state.submission, draft: state.draft });
  }
  const [sport, setSport] = useState("");
  const [rows, setRows] = useState<readonly EditorRow[]>([]);

  return (
    <form
      className={styles.form}
      action={action}
      key={`create-form-${refused.submission}`}
    >
      <input type="hidden" name="operation" value="create" />
      <SavedSessionFields
        idPrefix="create"
        draft={refused.draft}
        onSportChange={setSport}
      />
      <ActivityEditor
        idPrefix="create"
        initial={rows.map((row) => row.value)}
        sessionSport={sport}
        onRowsChange={setRows}
      />
      <button className={styles.primary} type="submit" disabled={pending}>
        Add to library
      </button>
    </form>
  );
}

function SavedSessionFields({
  idPrefix,
  draft,
  onSportChange,
}: {
  idPrefix: string;
  draft?: LibraryDraft;
  /** The sport as it is typed, for a form whose new activities start from it. */
  onSportChange?: (sport: string) => void;
}) {
  return (
    <>
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
          <SportInput
            id={`${idPrefix}-sport`}
            name="sport"
            required
            defaultValue={draft?.sport ?? ""}
            onChange={onSportChange}
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
