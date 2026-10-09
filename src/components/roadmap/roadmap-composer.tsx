"use client";

import { useId, useRef, useState } from "react";

import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import {
  isRefusal,
  useRoadmapRecovered,
  useRoadmapWrite,
} from "./use-roadmap-write";

import {
  ROADMAP_FEEDBACK_MAX_LENGTH,
  ROADMAP_NOTE_MAX_LENGTH,
} from "@/app/home/plan/roadmap/action-state";
import { generateRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { DateField } from "@/components/date-field/date-field";
import { CoachSpark } from "@/components/home/coach-spark";
import {
  COACH_START_MAX_DAYS_AHEAD,
  shiftIsoDate,
} from "@/lib/date/local-date";
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
  startDate,
  endDate,
  today,
  minDays,
  maxDays,
  previousProposalId,
  regenerationsRemaining,
}: {
  mode: "initial" | "regeneration";
  /** The date the form opens on: the default horizon, or the predecessor's. */
  endDate: string;
  /** The day the form opens on: today, or the predecessor's first day. */
  startDate: string;
  /** The owner's local today: the earliest first day. */
  today: string;
  /** How long a roadmap may be, counted from its first day. */
  minDays: number;
  maxDays: number;
  /** The declined proposal a regeneration carries. Absent on a first request. */
  previousProposalId?: string;
  regenerationsRemaining: number;
}) {
  const {
    state,
    submit: write,
    pending,
    lostRender,
  } = useRoadmapWrite(generateRoadmapAction);
  // Nothing composed in this document yet, so a recovery marker left by the
  // write before the reload is this form's to explain.
  const recovered = useRoadmapRecovered(state.submission === 0);
  const keyRef = useRef<string | null>(null);
  // Explicit ids rather than a wrapping `<label>`. A label that wraps its
  // control takes its whole text content as the accessible name, so the helper
  // sentence and the character count would be read out as part of the field's
  // name; `aria-describedby` says what they actually are.
  const fieldId = useId();

  // The two counted fields are controlled so the character count is the value's
  // own length rather than a second source of truth. A form action resets an
  // uncontrolled form when its reply commits, so they are re-seeded from the
  // returned draft during render rather than in an effect: an effect would
  // paint the emptied field first and then refill it.
  const [seenSubmission, setSeenSubmission] = useState(state.submission);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  if (seenSubmission !== state.submission) {
    setSeenSubmission(state.submission);
    setNote(state.draft?.planningNote ?? "");
    setFeedback(state.draft?.regenerationFeedback ?? "");
  }

  const isRegeneration = mode === "regeneration";

  // The end is counted from the first day, so its range follows the start the
  // owner has chosen. A start half typed keeps the range it had. An end the
  // new start leaves too near or too far is moved to the nearest date it
  // allows, rather than left for the owner to find out why the form stopped.
  const [chosenStart, setChosenStart] = useState(startDate);
  const [chosenEnd, setChosenEnd] = useState(endDate);
  const [endSeed, setEndSeed] = useState(endDate);
  function chooseStart(date: string) {
    if (date === "") return;
    setChosenStart(date);
    const earliest = shiftIsoDate(date, minDays);
    const latest = shiftIsoDate(date, maxDays);
    const kept =
      chosenEnd < earliest ? earliest : chosenEnd > latest ? latest : chosenEnd;
    if (kept !== chosenEnd) {
      setChosenEnd(kept);
      setEndSeed(kept);
    }
  }

  function submit(formData: FormData) {
    // A new attempt gets a new key; a retry of one that has not produced a
    // proposal reuses it, which is what makes the retry cheap rather than a
    // second charge on a live binding. `state` here is the latest rendered
    // result, which is exactly the attempt being retried.
    if (keyRef.current === null || state.status === "proposal") {
      keyRef.current = globalThis.crypto.randomUUID();
    }
    formData.set("idempotencyKey", keyRef.current);
    write(formData);
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

      <RoadmapWatchNotice lostRender={lostRender} recovered={recovered} />

      {/* Only a refusal renders here. A generation that lands removes this
          form, so its sentence is reported to `RoadmapOutcomeNotice` instead. */}
      {isRefusal(state) ? (
        <p
          className={styles.notice}
          data-roadmap-notice={state.status}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <form action={submit} className={styles.form}>
        {isRegeneration && previousProposalId ? (
          <input
            type="hidden"
            name="previousProposalId"
            value={previousProposalId}
          />
        ) : null}

        <div className={styles.field}>
          {/* The owner's to choose (9 Oct 2026). Fixed on a regeneration,
              as the end is. */}
          <DateField
            calendar
            describedBy={isRegeneration ? undefined : `${fieldId}-start-help`}
            initial={startDate}
            label={ROADMAP_CONTROL_COPY.startDateLabel}
            labelClassName={styles.label}
            max={shiftIsoDate(today, COACH_START_MAX_DAYS_AHEAD)}
            min={today}
            name="startDate"
            onChange={chooseStart}
            rangeMessage={
              isRegeneration ? undefined : ROADMAP_CONTROL_COPY.startDateHelper
            }
            readOnly={isRegeneration}
            required
          />
          {isRegeneration ? null : (
            <span className={styles.helper} id={`${fieldId}-start-help`}>
              {ROADMAP_CONTROL_COPY.startDateHelper}
            </span>
          )}
        </div>

        <div className={styles.field}>
          {/* A regeneration is defined as the same question about the same
              dates, and the database refuses one whose horizon moved. Showing
              the date but refusing to change it is honest about that; hiding
              it would leave the owner guessing which dates they are asking
              about. */}
          <DateField
            calendar
            describedBy={`${fieldId}-end-help`}
            initial={endSeed}
            // Remounted when the start moved the end, which is the one time
            // this field's date changes without the owner typing it.
            key={endSeed}
            label={ROADMAP_CONTROL_COPY.endDateLabel}
            labelClassName={styles.label}
            max={shiftIsoDate(chosenStart, maxDays)}
            min={shiftIsoDate(chosenStart, minDays)}
            name="endDate"
            onChange={(date) => {
              if (date !== "") setChosenEnd(date);
            }}
            // A typed date is held to the range as a picked one is. Not a
            // regeneration's: its date is the earlier proposal's, whatever
            // today allows.
            rangeMessage={
              isRegeneration ? undefined : ROADMAP_CONTROL_COPY.endDateHelper
            }
            readOnly={isRegeneration}
            required
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
            <CoachSpark size={16} />
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
