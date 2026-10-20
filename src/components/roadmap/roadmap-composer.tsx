"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";

import { RoadmapComposeSessionContext } from "./roadmap-compose-session";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import {
  isRefusal,
  useRoadmapRecovered,
  useRoadmapWrite,
} from "./use-roadmap-write";

import { ROADMAP_NOTE_MAX_LENGTH } from "@/app/home/plan/roadmap/action-state";
import { generateRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { CoachWait } from "@/components/coach-wait/coach-wait";
import { CoachSpark } from "@/components/home/coach-spark";
import {
  COACH_START_MAX_DAYS_AHEAD,
  shiftIsoDate,
} from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * Asking the coach for a roadmap: a new one, or a change to the one in force.
 * Asking again after a decline is not here: it is offered on the proposal
 * itself (`roadmap-decision-dock.tsx`), where it can be read.
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
  headingId,
}: {
  /** Set where the heading names something else too: the sheet it is in. */
  headingId?: string;
  /**
   * `change` (ADR-028) is a first request about the roadmap in force: the
   * coach is sent the whole of it, and the note, which is then required,
   * says what should be different.
   */
  mode: "initial" | "change";
  /** The date the form opens on. */
  endDate: string;
  /** The day the form opens on. */
  startDate: string;
  /** The owner's local today: the earliest first day. */
  today: string;
  /** How long a roadmap may be, counted from its first day. */
  minDays: number;
  maxDays: number;
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
  // A reply whose attempt ended without a proposal clears the key once, so
  // the next tap asks again under a new one. Cleared here rather than in
  // `submit`, where two taps before `pending` lands would see the same
  // reply and take a key each: two paid calls (17 Oct 2026).
  const attemptEnded = state.attemptEnded === true;
  useEffect(() => {
    if (attemptEnded) keyRef.current = null;
  }, [attemptEnded, state.submission, keyRef]);
  const reportPending = session?.setPending;
  useEffect(() => {
    reportPending?.(pending);
    return () => reportPending?.(false);
  }, [reportPending, pending]);
  // Explicit ids rather than a wrapping `<label>`. A label that wraps its
  // control takes its whole text content as the accessible name, so the
  // character count would be read out as part of the field's name.
  const fieldId = useId();

  // The counted field is controlled so the character count is the value's own
  // length rather than a second source of truth. A form action resets an
  // uncontrolled form when its reply commits, so it is re-seeded from the
  // returned draft during render rather than in an effect: an effect would
  // paint the emptied field first and then refill it.
  const [seenSubmission, setSeenSubmission] = useState(state.submission);
  const [note, setNote] = useState("");
  if (seenSubmission !== state.submission) {
    setSeenSubmission(state.submission);
    setNote(state.draft?.planningNote ?? "");
  }

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
        {isChange
          ? ROADMAP_CONTROL_COPY.changeTitle
          : ROADMAP_CONTROL_COPY.composeTitle}
      </h2>

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

        <div className={styles.field}>
          <div className={styles.dateRow}>
            {/* The start is the owner's to choose (9 Oct 2026). */}
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
                onChange={(event) => chooseStart(event.target.value)}
                min={today}
                max={latestStart}
                required
              />
            </div>
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
                onChange={(event) => setChosenEnd(event.target.value)}
                min={shiftIsoDate(rangeStart, minDays)}
                max={shiftIsoDate(rangeStart, maxDays)}
                required
              />
            </div>
          </div>
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

        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={pending}
          >
            <CoachSpark size={16} />
            {isChange
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
        <>
          <p className={styles.pending} role="status">
            {ROADMAP_CONTROL_COPY.pending}
          </p>
          <CoachWait kind="roadmap" />
        </>
      ) : null}
    </section>
  );
}
