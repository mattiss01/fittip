"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";

import { RoadmapComposeSessionContext } from "./roadmap-compose-session";
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
  headingId,
}: {
  /** Set where the heading names something else too: the sheet it is in. */
  headingId?: string;
  /**
   * `change` (ADR-028) is a first request about the roadmap in force: the
   * coach is sent the whole of it, and the note, which is then required,
   * says what should be different.
   */
  mode: "initial" | "regeneration" | "change";
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
  // In the "New roadmap" sheet the key is the sheet's, so it outlasts a close;
  // on the page it is this form's own. The sheet is also told while a request
  // is under way, and stays open until the reply is in.
  const session = useContext(RoadmapComposeSessionContext);
  const ownKey = useRef<string | null>(null);
  const keyRef = session?.idempotencyKey ?? ownKey;
  const reportPending = session?.setPending;
  useEffect(() => {
    reportPending?.(pending);
    return () => reportPending?.(false);
  }, [reportPending, pending]);
  // Explicit ids rather than a wrapping `<label>`. A label that wraps its
  // control takes its whole text content as the accessible name, so the
  // character count would be read out as part of the field's name.
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
  const isChange = mode === "change";

  // Each date is one field, the browser's own (owner, 13 Oct 2026), and the
  // two stand side by side. Both are held here, so a reply that resets the
  // form leaves them as chosen.
  //
  // The end is counted from the first day, so its range follows the start the
  // owner has chosen. A start half typed, which passes through years like
  // 0002, or one outside what may be asked for, keeps the range it had. An end
  // the new start leaves too near or too far is moved to the nearest date it
  // allows, rather than left for the owner to find out why the form stopped.
  const latestStart = shiftIsoDate(today, COACH_START_MAX_DAYS_AHEAD);
  const [chosenStart, setChosenStart] = useState(startDate);
  const [rangeStart, setRangeStart] = useState(startDate);
  const [chosenEnd, setChosenEnd] = useState(endDate);
  function chooseStart(date: string) {
    setChosenStart(date);
    if (date < today || date > latestStart) return;
    setRangeStart(date);
    const earliest = shiftIsoDate(date, minDays);
    const latest = shiftIsoDate(date, maxDays);
    if (chosenEnd !== "" && chosenEnd < earliest) setChosenEnd(earliest);
    else if (chosenEnd > latest) setChosenEnd(latest);
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
      <h2 className={styles.cardHeading} id={headingId}>
        {isRegeneration
          ? ROADMAP_CONTROL_COPY.regenerateTitle
          : isChange
            ? ROADMAP_CONTROL_COPY.changeTitle
            : ROADMAP_CONTROL_COPY.composeTitle}
      </h2>
      {/* What a regeneration sends is said; a first request needs no
          introduction (owner, 13 Oct 2026). */}
      {isRegeneration ? (
        <p className={styles.emptyState}>
          {ROADMAP_CONTROL_COPY.regenerateSupport}
        </p>
      ) : null}

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
        {isChange ? (
          <input type="hidden" name="changeRoadmap" value="true" />
        ) : null}
        {isRegeneration && previousProposalId ? (
          <input
            type="hidden"
            name="previousProposalId"
            value={previousProposalId}
          />
        ) : null}

        <div className={styles.field}>
          <div className={styles.dateRow}>
            {/* The start is the owner's to choose (9 Oct 2026). Fixed on a
                regeneration, as the end is, and then held to no range: the
                dates are the earlier proposal's, whatever today allows. */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-start`}>
                {ROADMAP_CONTROL_COPY.startDateLabel}
              </label>
              <input
                className={styles.input}
                id={`${fieldId}-start`}
                type="date"
                name="startDate"
                value={chosenStart}
                // Fixed means fixed, in a browser that opens its picker on a
                // read-only field too.
                onChange={(event) => {
                  if (!isRegeneration) chooseStart(event.target.value);
                }}
                {...(isRegeneration ? {} : { min: today, max: latestStart })}
                readOnly={isRegeneration}
                required
              />
            </div>
            {/* A regeneration is defined as the same question about the same
                dates, and the database refuses one whose horizon moved.
                Showing the dates but refusing to change them is honest about
                that; hiding them would leave the owner guessing which dates
                they are asking about. */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-end`}>
                {ROADMAP_CONTROL_COPY.endDateLabel}
              </label>
              <input
                className={styles.input}
                id={`${fieldId}-end`}
                type="date"
                name="endDate"
                value={chosenEnd}
                onChange={(event) => {
                  if (!isRegeneration) setChosenEnd(event.target.value);
                }}
                {...(isRegeneration
                  ? { "aria-describedby": `${fieldId}-dates-help` }
                  : {
                      min: shiftIsoDate(rangeStart, minDays),
                      max: shiftIsoDate(rangeStart, maxDays),
                    })}
                readOnly={isRegeneration}
                required
              />
            </div>
          </div>
          {isRegeneration ? (
            <span className={styles.helper} id={`${fieldId}-dates-help`}>
              {ROADMAP_CONTROL_COPY.regenerateDatesFixed}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-note`}>
            {isChange
              ? ROADMAP_CONTROL_COPY.changeNoteLabel
              : ROADMAP_CONTROL_COPY.planningNoteLabel}
          </label>
          <textarea
            className={styles.textarea}
            id={`${fieldId}-note`}
            name="planningNote"
            maxLength={ROADMAP_NOTE_MAX_LENGTH}
            required={isChange}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
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
              : isChange
                ? ROADMAP_CONTROL_COPY.changeConfirm
                : ROADMAP_CONTROL_COPY.generateAction}
          </button>
          {/* A change says what it sends, which is more than a new roadmap
              does; the sentence ends as the other one does. */}
          <p className={styles.helper}>
            {isChange
              ? ROADMAP_CONTROL_COPY.changeSupport
              : ROADMAP_CONTROL_COPY.generateSupport}
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
