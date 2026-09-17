"use client";

import { useActionState, useState } from "react";

import { RoadmapEditor } from "./roadmap-editor";

import { INITIAL_ROADMAP_ACTION_STATE } from "@/app/home/plan/roadmap/action-state";
import {
  acceptRoadmapAction,
  declineRoadmapAction,
  editRoadmapAction,
} from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The three things an owner can do with the proposal that is waiting.
 *
 * No action is preselected and none is destructive by default: accepting keeps
 * every earlier version, declining keeps the proposal in history, and editing
 * creates a new proposal rather than rewriting this one. Declining is the only
 * one that asks first, because it is the only one that closes a proposal
 * without producing anything to look at.
 *
 * ## Why all three are form actions
 *
 * Including the edit, whose payload is a nested draft rather than a set of
 * fields. A Server Action called imperatively from a transition invalidates the
 * route but does not reliably hand this tree the refreshed payload, and the
 * browser flow caught exactly that: the edit committed, the dock reported
 * success, and the review above it went on showing the proposal the edit came
 * from. A form action gets the new tree as part of
 * the action's own response, so the surface cannot disagree with the database
 * about which proposal is open. The draft rides as one JSON field, which costs
 * a parse the server would have to do anyway — the content is revalidated by
 * `validateRoadmapCandidate` and bounded again by the database, so malformed
 * JSON is a validation failure like any other.
 *
 * Three separate `useActionState` hooks rather than one shared reducer: they
 * are three independent submissions with their own pending flags, and sharing
 * state would make one control's reply appear under another.
 *
 * The client boundary stops here. Everything above this component — the
 * proposal itself, the spine, the example label — is rendered on the server, so
 * the only roadmap content that crosses into the browser is the `content` the
 * editor needs in order to edit it. The owner's planning note is not part of
 * that content and stays server-side.
 */
export function RoadmapDecisionDock({
  proposalId,
  content,
  expectedHeadRevision,
  goalTitles,
}: {
  proposalId: string;
  /** The proposal body, needed only so the editor can open on it. */
  content: unknown;
  expectedHeadRevision: number;
  goalTitles: Record<string, string>;
}) {
  const [accepted, acceptAction, accepting] = useActionState(
    acceptRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [declined, declineAction, declining] = useActionState(
    declineRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [edited, editAction, saving] = useActionState(
    editRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [editorOpen, setEditorOpen] = useState(false);

  // The editor closes when its own submission comes back accepted, decided
  // during render rather than in an effect: an effect would paint the editor
  // once more over content that is already superseded. A rejected edit keeps
  // the editor open, because the draft is the thing that needs correcting.
  const [seenEdit, setSeenEdit] = useState(edited.submission);
  if (seenEdit !== edited.submission) {
    setSeenEdit(edited.submission);
    if (edited.status === "edited") setEditorOpen(false);
  }

  const busy = accepting || declining || saving;
  // Whichever control last reported something. All three start at submission 0,
  // so an untouched dock shows nothing.
  const latest = [accepted, declined, edited]
    .filter((state) => state.status !== "idle")
    .sort((a, b) => a.submission - b.submission)
    .at(-1);

  if (editorOpen) {
    return (
      <RoadmapEditor
        proposalId={proposalId}
        content={content}
        goalTitles={goalTitles}
        formAction={editAction}
        message={edited.status === "edited" ? "" : edited.message}
        saving={saving}
        onCancel={() => setEditorOpen(false)}
      />
    );
  }

  return (
    <div className={styles.dock} data-roadmap-dock={proposalId}>
      <h3 className={styles.sectionHeading}>
        {ROADMAP_CONTROL_COPY.decideTitle}
      </h3>
      <p className={styles.emptyState}>{ROADMAP_CONTROL_COPY.decideSupport}</p>

      {latest === undefined ? null : (
        <p
          className={styles.notice}
          data-roadmap-notice={latest.status}
          role="status"
        >
          {latest.message}
        </p>
      )}

      <div className={styles.actions}>
        <form action={acceptAction}>
          <input type="hidden" name="proposalId" value={proposalId} />
          <input
            type="hidden"
            name="expectedHeadRevision"
            value={expectedHeadRevision}
          />
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={busy}
          >
            {ROADMAP_CONTROL_COPY.acceptAction}
          </button>
        </form>

        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() => setEditorOpen(true)}
          disabled={busy}
        >
          {ROADMAP_CONTROL_COPY.editAction}
        </button>

        <form
          action={declineAction}
          onSubmit={(event) => {
            if (!globalThis.confirm(ROADMAP_CONTROL_COPY.declineConfirm)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="proposalId" value={proposalId} />
          <button className={styles.quietAction} type="submit" disabled={busy}>
            {ROADMAP_CONTROL_COPY.declineAction}
          </button>
        </form>
      </div>
    </div>
  );
}
