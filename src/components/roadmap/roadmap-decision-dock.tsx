"use client";

import { useState } from "react";

import { RoadmapEditor } from "./roadmap-editor";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import {
  isRefusal,
  useRoadmapRecovered,
  useRoadmapWrite,
} from "./use-roadmap-write";

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
 * ## Why all three are form actions, watched
 *
 * Including the edit, whose payload is a nested draft rather than a set of
 * fields. A form action gets the revalidated tree back with the action's own
 * reply, so the screen the owner reads the outcome on is the screen the write
 * produced. `use-roadmap-write.ts` carries the evidence for that and for the
 * watchdog that covers the transition which intermittently never commits.
 *
 * The draft rides as one JSON field, which costs no trust: the body goes to
 * `validateRoadmapCandidate` — the validator the coach's own output goes
 * through — and is bounded again by the database, so malformed JSON is a
 * validation failure like any other.
 *
 * Three separate writes rather than one shared reducer: they are three
 * independent submissions with their own pending flags, and sharing state
 * would make one control's reply appear under another.
 *
 * ## Why this component is not keyed by its proposal
 *
 * An edit is the one write that replaces the open proposal under a control that
 * stays on screen: generation removes the compose form, and acceptance and
 * decline remove the review, so each of those discards the component that
 * submitted. Keying this dock by the proposal would remount it on a successful
 * edit and throw away the approved sentence that edit just earned. What the key
 * was reaching for — an editor left open over a record it was never about — is
 * handled where it belongs: the editor is closed during the render that sees
 * its own submission come back edited, and a reply that never renders at all is
 * the watchdog's case.
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
  const accept = useRoadmapWrite(acceptRoadmapAction);
  const decline = useRoadmapWrite(declineRoadmapAction);
  const edit = useRoadmapWrite(editRoadmapAction);
  const [editorOpen, setEditorOpen] = useState(false);

  // The editor closes when its own submission comes back edited, decided
  // during render rather than in an effect: an effect would paint the editor
  // once more over content that is already superseded. A rejected edit keeps
  // the editor open, because the draft is the thing that needs correcting.
  const [seenEdit, setSeenEdit] = useState(edit.state.submission);
  if (seenEdit !== edit.state.submission) {
    setSeenEdit(edit.state.submission);
    if (edit.state.status === "edited") setEditorOpen(false);
  }

  const busy = accept.pending || decline.pending || edit.pending;
  const lostRender = accept.lostRender || decline.lostRender || edit.lostRender;
  const untouched =
    accept.state.submission === 0 &&
    decline.state.submission === 0 &&
    edit.state.submission === 0;
  // Explained once for the whole dock, not once per control.
  const recovered = useRoadmapRecovered(untouched);

  // Whichever control last refused, and why. A write that landed says so in
  // `RoadmapOutcomeNotice`, which survives the two of these three that remove
  // this dock.
  const latest = [accept.state, decline.state, edit.state]
    .filter(isRefusal)
    .sort((a, b) => a.submission - b.submission)
    .at(-1);

  if (editorOpen) {
    return (
      <RoadmapEditor
        proposalId={proposalId}
        content={content}
        goalTitles={goalTitles}
        formAction={edit.submit}
        // A landed edit closes this editor, so the only message it ever shows
        // is the one the owner has to act on.
        message={isRefusal(edit.state) ? edit.state.message : ""}
        saving={edit.pending}
        lostRender={edit.lostRender}
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

      <RoadmapWatchNotice lostRender={lostRender} recovered={recovered} />

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
        <form action={accept.submit}>
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
          action={decline.submit}
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
