"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { RoadmapEditor } from "./roadmap-editor";

import {
  INITIAL_ROADMAP_ACTION_STATE,
  type RoadmapActionState,
} from "@/app/home/plan/roadmap/action-state";
import {
  acceptRoadmapAction,
  declineRoadmapAction,
} from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The three things an owner can do with the proposal that is waiting.
 *
 * No action is preselected and none is destructive-by-default: accepting keeps
 * every earlier version, declining keeps the proposal in history, and editing
 * creates a new proposal rather than rewriting this one. Declining is the only
 * one that asks first, because it is the only one that closes a proposal
 * without producing anything to look at.
 *
 * Two separate `useActionState` hooks rather than one shared reducer. They are
 * two independent submissions with their own pending flags, and sharing state
 * would make one control's reply appear under the other.
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
  const router = useRouter();
  const [accepted, acceptAction, accepting] = useActionState(
    acceptRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [declined, declineAction, declining] = useActionState(
    declineRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<RoadmapActionState | null>(null);

  const busy = accepting || declining;
  // Whichever control last reported something. Both start at submission 0, so
  // an untouched dock shows nothing.
  const latest = [accepted, declined, edited ?? INITIAL_ROADMAP_ACTION_STATE]
    .filter((state) => state.status !== "idle")
    .at(-1);

  if (editing) {
    return (
      <RoadmapEditor
        proposalId={proposalId}
        content={content}
        submission={accepted.submission + declined.submission}
        goalTitles={goalTitles}
        onClose={(result) => {
          setEditing(false);
          if (result === null) return;
          setEdited(result);
          // An edit creates a *new* proposal, so the review above it has to be
          // re-read. The action revalidates this path, but the editor closes
          // inside the same transition that would carry the new tree, and that
          // tree has been observed not to arrive — the review reappeared
          // showing the proposal the edit came from. Asking for it again is one
          // request and cannot show stale content.
          router.refresh();
        }}
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
          onClick={() => setEditing(true)}
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
