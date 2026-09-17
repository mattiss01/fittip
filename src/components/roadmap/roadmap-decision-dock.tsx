"use client";

import { useState, type FormEvent } from "react";

import { RoadmapEditor } from "./roadmap-editor";
import { useRoadmapWrite } from "./use-roadmap-write";

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
 * The document reloads instead; `use-roadmap-write.ts` records the browser
 * evidence for that. This dock only ever renders a refusal.
 *
 * Accept and decline each hold their own write, beside the form that submits
 * it, and the editor holds its own: they are independent submissions with their
 * own saving flags, and sharing state would make one control's refusal appear
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
  const accept = useRoadmapWrite(
    acceptRoadmapAction,
    ROADMAP_CONTROL_COPY.outcomes.decisionFailed,
  );
  const decline = useRoadmapWrite(
    declineRoadmapAction,
    ROADMAP_CONTROL_COPY.outcomes.decisionFailed,
  );
  const [editorOpen, setEditorOpen] = useState(false);

  const busy = accept.saving || decline.saving;
  // Whichever control last refused, and why. A write that landed never gets
  // here, because the document reloads.
  const latest = [accept.refused, decline.refused]
    .filter((state) => state !== null)
    .sort((a, b) => a.submission - b.submission)
    .at(-1);

  function submitWith(write: typeof accept.submit) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void write(new FormData(event.currentTarget));
    };
  }

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
        <form onSubmit={submitWith(accept.submit)}>
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
          onSubmit={(event) => {
            event.preventDefault();
            if (!globalThis.confirm(ROADMAP_CONTROL_COPY.declineConfirm)) {
              return;
            }
            void decline.submit(new FormData(event.currentTarget));
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
