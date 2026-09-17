"use client";

import { useActionState, useState } from "react";

import { RoadmapEditor } from "./roadmap-editor";

import { INITIAL_ROADMAP_ACTION_STATE } from "@/app/home/plan/roadmap/action-state";
import {
  acceptRoadmapAction,
  declineRoadmapAction,
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
 * ## Why a successful write never reports back here
 *
 * It navigates instead. The browser flow found that an action's own response
 * does not reliably carry the refreshed tree to this route: the write landed,
 * the control reported success, and the surface went on showing the record it
 * had replaced — for as long as the flow was willing to wait. The actions
 * therefore redirect on success, which ends the transition and refetches the
 * route, and this dock only ever renders a refusal.
 *
 * Accept and decline each own a `useActionState` here, beside the form that
 * submits it, and the editor owns its own for the same reason: the component
 * that renders a form owns that form's action state. Separate hooks rather than
 * one shared reducer, because they are independent submissions with their own
 * pending flags, and sharing state would make one control's refusal appear
 * under another.
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
  const [editorOpen, setEditorOpen] = useState(false);

  const busy = accepting || declining;
  // Whichever control last refused, and why. Both start at submission 0, so an
  // untouched dock shows nothing, and a successful write never gets here
  // because it navigates.
  const latest = [accepted, declined]
    .filter((state) => state.status !== "idle")
    .sort((a, b) => a.submission - b.submission)
    .at(-1);

  if (editorOpen) {
    return (
      <RoadmapEditor
        proposalId={proposalId}
        content={content}
        goalTitles={goalTitles}
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
