"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import { RoadmapWriter } from "./roadmap-writer";
import {
  isRefusal,
  useRoadmapRecovered,
  useRoadmapWrite,
} from "./use-roadmap-write";

import { ROADMAP_FEEDBACK_MAX_LENGTH } from "@/app/home/plan/roadmap/action-state";
import {
  acceptRoadmapAction,
  askAgainRoadmapAction,
  declineRoadmapAction,
} from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The four things an owner can do with the proposal that is waiting: accept,
 * edit, ask for another, decline.
 *
 * No action is preselected and none is destructive by default: accepting keeps
 * every earlier version, declining keeps the proposal in history, and editing
 * creates a new proposal rather than rewriting this one. Declining is the only
 * one that asks first, because it is the only one that closes a proposal
 * without producing anything to look at. Asking for another (owner, 14 Oct
 * 2026) asks what should change first, below the proposal it is about, then
 * declines it and asks the coach again in one step.
 *
 * While the proposal is edited, the form is all there is: the proposal comes
 * in as `children`, server-rendered, and is not drawn beside its own edit.
 *
 * Some of what follows predates the form: the edit is `RoadmapWriter` now,
 * with its own reply, and closes itself through `onSaved`.
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
 * ## Why this component is keyed by its proposal
 *
 * Everything it holds — three replies, the editor's open state, the draft
 * inside it — is about one proposal, and an edit is the one write that replaces
 * the open proposal under a control that stays on screen. Without the key that
 * state would carry over: press Accept, get a conflict, edit and save, and the
 * dock under a brand-new proposal still shows a refusal about the one before
 * it. The key ends each proposal's dock with the proposal.
 *
 * It costs nothing to do so. The sentence a landed write earns does not live
 * here — `roadmap-outcome.tsx` holds it and `RoadmapScreen` renders it above
 * this whole section, precisely because every control on this surface is
 * removed by the write it performs.
 *
 * The editor is also closed during the render that sees its own submission come
 * back `edited`, which is not the same thing as the key: an edit's reply and
 * the revalidated tree that carries the new proposal need not commit together,
 * and between those two commits this dock is still the old proposal's. A reply
 * that never renders at all is the watchdog's case.
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
  today,
  regenerationsRemaining,
  children,
}: {
  proposalId: string;
  /** The proposal body, needed only so the editor can open on it. */
  content: unknown;
  expectedHeadRevision: number;
  goalTitles: Record<string, string>;
  today: string;
  /** Asks left on these dates; "Ask for another" goes when none are. */
  regenerationsRemaining: number;
  /** The proposal as the server rendered it, hidden while it is edited. */
  children: ReactNode;
}) {
  const accept = useRoadmapWrite(acceptRoadmapAction);
  const decline = useRoadmapWrite(declineRoadmapAction);
  const askAgain = useRoadmapWrite(askAgainRoadmapAction);
  const [editorOpen, setEditorOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [note, setNote] = useState("");
  // One key per attempt, so a retry after a dropped reply replays the first
  // request instead of paying for a second.
  const askKey = useRef<string | null>(null);
  const fieldId = useId();

  const busy = accept.pending || decline.pending || askAgain.pending;
  const lostRender =
    accept.lostRender || decline.lostRender || askAgain.lostRender;
  const untouched =
    accept.state.submission === 0 &&
    decline.state.submission === 0 &&
    askAgain.state.submission === 0;
  // Explained once for the whole dock, not once per control.
  const recovered = useRoadmapRecovered(untouched);

  // Whichever control last refused, and why. A write that landed says so in
  // `RoadmapOutcomeNotice`, which survives the writes that remove this dock.
  const latest = [accept.state, decline.state, askAgain.state]
    .filter(isRefusal)
    .sort((a, b) => a.submission - b.submission)
    .at(-1);

  // Editing shows the form and nothing else (owner, 14 Oct 2026): the
  // proposal it starts from is in the form.
  if (editorOpen) {
    return (
      <RoadmapWriter
        today={today}
        goals={Object.entries(goalTitles).map(([id, title]) => ({
          id,
          title,
        }))}
        expectedHeadRevision={expectedHeadRevision}
        replaces={false}
        edit={{
          proposalId,
          content,
          onCancel: () => setEditorOpen(false),
          onSaved: () => setEditorOpen(false),
        }}
      />
    );
  }

  function submitAskAgain(formData: FormData) {
    if (askKey.current === null) {
      askKey.current = globalThis.crypto.randomUUID();
    }
    formData.set("idempotencyKey", askKey.current);
    askAgain.submit(formData);
  }

  return (
    <>
      {children}
      <div className={styles.dock} data-roadmap-dock={proposalId}>
        <h3 className={styles.sectionHeading}>
          {ROADMAP_CONTROL_COPY.decideTitle}
        </h3>
        <p className={styles.emptyState}>
          {ROADMAP_CONTROL_COPY.decideSupport}
        </p>

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

        {askOpen ? (
          // "Ask for another" (owner, 14 Oct 2026): the button first, then
          // what should change, written with the proposal still above it.
          <form
            action={submitAskAgain}
            className={styles.form}
            data-roadmap-ask-again
          >
            <input type="hidden" name="proposalId" value={proposalId} />
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-note`}>
                {ROADMAP_CONTROL_COPY.askAgainLabel}
              </label>
              <textarea
                className={styles.textarea}
                id={`${fieldId}-note`}
                name="regenerationFeedback"
                maxLength={ROADMAP_FEEDBACK_MAX_LENGTH}
                rows={3}
                required
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <span className={styles.counter}>
                {note.length} / {ROADMAP_FEEDBACK_MAX_LENGTH}
              </span>
              <span className={styles.helper}>
                {ROADMAP_CONTROL_COPY.regenerationsRemaining(
                  regenerationsRemaining,
                )}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.primaryAction}
                type="submit"
                disabled={busy}
              >
                <CoachSpark size={16} />
                {ROADMAP_CONTROL_COPY.askAgainConfirm}
              </button>
              <button
                className={styles.quietAction}
                type="button"
                disabled={busy}
                onClick={() => setAskOpen(false)}
              >
                {ROADMAP_CONTROL_COPY.askAgainCancel}
              </button>
              <p className={styles.helper}>
                {ROADMAP_CONTROL_COPY.askAgainSupport}
              </p>
            </div>
            {askAgain.pending ? (
              <p className={styles.pending} role="status">
                {ROADMAP_CONTROL_COPY.pending}
              </p>
            ) : null}
          </form>
        ) : (
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

            {regenerationsRemaining > 0 ? (
              <button
                className={styles.secondaryAction}
                type="button"
                data-roadmap-ask-again-open
                onClick={() => setAskOpen(true)}
                disabled={busy}
              >
                <CoachSpark size={16} />
                {ROADMAP_CONTROL_COPY.askAgainAction}
              </button>
            ) : null}

            <form
              action={decline.submit}
              onSubmit={(event) => {
                if (!globalThis.confirm(ROADMAP_CONTROL_COPY.declineConfirm)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="proposalId" value={proposalId} />
              <button
                className={styles.quietAction}
                type="submit"
                disabled={busy}
              >
                {ROADMAP_CONTROL_COPY.declineAction}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
