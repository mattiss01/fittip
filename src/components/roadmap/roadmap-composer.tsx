"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { useRoadmapWrite } from "./use-roadmap-write";

import {
  ROADMAP_FEEDBACK_MAX_LENGTH,
  ROADMAP_NOTE_MAX_LENGTH,
} from "@/app/home/plan/roadmap/action-state";
import { generateRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * Asking the coach for a roadmap: the first request and every regeneration.
 *
 * One component for both, because they are one operation. What separates them
 * is a predecessor, and the database re-derives that independently — a claimed
 * regeneration with no declined, same-horizon predecessor is refused before the
 * coach is called. So the mode below changes labels, prefills and which fields
 * are editable; it does not change what is trusted.
 *
 * ## The idempotency key
 *
 * A key is minted when a compose attempt begins and kept until that attempt
 * produces a proposal. That is the whole point of it: a dropped response
 * followed by a second press replays the first attempt instead of buying a
 * second coaching call, which on a live binding is a second charge. It is
 * minted in the submit handler rather than during render, because a random
 * value generated while rendering differs between the server and the browser
 * and would either hydrate wrong or have to be suppressed.
 */
export function RoadmapComposer({
  mode,
  endDate,
  minEndDate,
  maxEndDate,
  previousProposalId,
  regenerationsRemaining,
}: {
  mode: "initial" | "regeneration";
  /** The date the form opens on: the default horizon, or the predecessor's. */
  endDate: string;
  minEndDate: string;
  maxEndDate: string;
  /** The declined proposal a regeneration carries. Absent on a first request. */
  previousProposalId?: string;
  regenerationsRemaining: number;
}) {
  // A proposal that lands reloads the document, so this component only ever
  // renders a refusal; see `use-roadmap-write.ts` for why.
  const {
    saving: pending,
    refused,
    submit: write,
  } = useRoadmapWrite(
    generateRoadmapAction,
    ROADMAP_CONTROL_COPY.outcomes.generationFailed,
  );
  const keyRef = useRef<string | null>(null);
  // Explicit ids rather than a wrapping `<label>`. A label that wraps its
  // control takes its whole text content as the accessible name, so the helper
  // sentence and the character count would be read out as part of the field's
  // name; `aria-describedby` says what they actually are.
  const fieldId = useId();

  // The two counted fields are controlled so the character count is the value's
  // own length rather than a second source of truth. A refusal leaves them as
  // typed: nothing reset them, so there is nothing to restore.
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");

  const isRegeneration = mode === "regeneration";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // A new attempt gets a new key; a retry of one that has not produced a
    // proposal reuses it. A successful generation never returns here — the
    // document reloads — so this form only ever sees an attempt that did not
    // produce one, and reusing the key is exactly what makes the retry cheap.
    if (keyRef.current === null) {
      keyRef.current = globalThis.crypto.randomUUID();
    }
    formData.set("idempotencyKey", keyRef.current);
    void write(formData);
  }

  return (
    <section className={styles.card} data-roadmap-compose={mode}>
      <h2 className={styles.cardHeading}>
        {isRegeneration
          ? ROADMAP_CONTROL_COPY.regenerateTitle
          : ROADMAP_CONTROL_COPY.composeTitle}
      </h2>
      <p className={styles.emptyState}>
        {isRegeneration
          ? ROADMAP_CONTROL_COPY.regenerateSupport
          : ROADMAP_CONTROL_COPY.composeSupport}
      </p>

      {refused === null ? null : (
        <p
          className={styles.notice}
          data-roadmap-notice={refused.status}
          role="status"
        >
          {refused.message}
        </p>
      )}

      <form onSubmit={submit} className={styles.form}>
        {isRegeneration && previousProposalId ? (
          <input
            type="hidden"
            name="previousProposalId"
            value={previousProposalId}
          />
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-end`}>
            {ROADMAP_CONTROL_COPY.endDateLabel}
          </label>
          <input
            className={styles.input}
            id={`${fieldId}-end`}
            aria-describedby={`${fieldId}-end-help`}
            type="date"
            name="endDate"
            min={minEndDate}
            max={maxEndDate}
            required
            // A regeneration is defined as the same question about the same
            // dates, and the database refuses one whose horizon moved. Showing
            // the field but refusing to change it is honest about that; hiding
            // it would leave the owner guessing which dates they are asking
            // about.
            readOnly={isRegeneration}
            defaultValue={endDate}
          />
          <span className={styles.helper} id={`${fieldId}-end-help`}>
            {isRegeneration
              ? ROADMAP_CONTROL_COPY.regenerateDatesFixed
              : ROADMAP_CONTROL_COPY.endDateHelper}
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-note`}>
            {ROADMAP_CONTROL_COPY.planningNoteLabel}
          </label>
          <textarea
            className={styles.textarea}
            id={`${fieldId}-note`}
            aria-describedby={`${fieldId}-note-help`}
            name="planningNote"
            maxLength={ROADMAP_NOTE_MAX_LENGTH}
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <span className={styles.helper} id={`${fieldId}-note-help`}>
            {ROADMAP_CONTROL_COPY.planningNoteHelper}
          </span>
          <span className={styles.counter}>
            {note.length} / {ROADMAP_NOTE_MAX_LENGTH}
          </span>
        </div>

        {isRegeneration ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-feedback`}>
              {ROADMAP_CONTROL_COPY.feedbackLabel}
            </label>
            <textarea
              className={styles.textarea}
              id={`${fieldId}-feedback`}
              aria-describedby={`${fieldId}-feedback-help`}
              name="regenerationFeedback"
              maxLength={ROADMAP_FEEDBACK_MAX_LENGTH}
              rows={3}
              required
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <span className={styles.counter}>
              {feedback.length} / {ROADMAP_FEEDBACK_MAX_LENGTH}
            </span>
            <span className={styles.helper} id={`${fieldId}-feedback-help`}>
              {ROADMAP_CONTROL_COPY.regenerationsRemaining(
                regenerationsRemaining,
              )}
            </span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={pending}
          >
            {isRegeneration
              ? ROADMAP_CONTROL_COPY.regenerateConfirm
              : ROADMAP_CONTROL_COPY.generateAction}
          </button>
          <p className={styles.helper}>
            {ROADMAP_CONTROL_COPY.generateSupport}
          </p>
        </div>
      </form>

      {pending ? (
        <p className={styles.pending} role="status">
          {ROADMAP_CONTROL_COPY.pending}
        </p>
      ) : null}
    </section>
  );
}
