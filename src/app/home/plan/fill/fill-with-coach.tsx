"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";

import {
  dismissSessionActivitiesAction,
  fillSessionActivitiesAction,
} from "./actions";
import styles from "./fill-with-coach.module.css";
import type { FillProposal } from "./fill-state";

import type {
  ActivityEditorHandle,
  ActivityValue,
  EditorRow,
} from "@/components/training/activity-editor";
import { describeMeasurement } from "@/lib/training/describe-measurement";

/** Matches `SESSION_FILL_NOTE_MAX_LENGTH`, which the action enforces. */
const NOTE_MAX_LENGTH = 500;

/**
 * The form field Save carries, once per suggestion it should record as
 * accepted. Matches `ACTIVITY_PROPOSAL_FIELD` on the server, which a client
 * module cannot import.
 */
const PROPOSAL_FIELD = "activityProposalId";

type Open = {
  proposal: FillProposal;
  /** Indexes into the coach's activities the owner removed from the draft. */
  removed: ReadonlySet<number>;
  /**
   * Planned activities the owner added to the draft, by the editor row they
   * came from and its value at the time, in the order they were added.
   */
  added: readonly EditorRow[];
  /** Read from the Plan rather than asked for in this form. */
  fromPlan: boolean;
};

/**
 * Suggestions dismissed since this page loaded. Module state on purpose: a
 * save remounts the edit form, and the remounted form can be handed the Plan
 * as it was read before the dismissal, so the answer has to outlive the form.
 * A reload starts empty, and by then the Plan read itself no longer returns a
 * dismissed suggestion.
 *
 * Accepting does not enter here. An accepted suggestion is only decided once
 * its save lands; if the save is refused, the remounted form has lost the
 * accepted list, and the suggestion coming back from the Plan read is what
 * lets the owner accept it again.
 */
const answeredOnThisPage = new Set<string>();

/** The Plan's open suggestion, unless it was answered on this page. */
function fromPlan(proposal: FillProposal | undefined): Open | null {
  if (proposal === undefined || answeredOnThisPage.has(proposal.proposalId)) {
    return null;
  }
  return { proposal, removed: new Set(), added: [], fromPlan: true };
}

/**
 * Fill with coach, inside a session's Edit panel (A7-4, owner's design of
 * 28 Sep 2026).
 *
 * The suggestion is a draft of its own, in a box above the activity list, and
 * the list does not change until the owner decides. In the box they remove
 * coach activities (with Undo) and add any of the currently planned ones.
 * Accept replaces the list with what the box holds; Dismiss closes the box and
 * leaves the list exactly as it is. Either way the list stays editable, and a
 * lock hides none of this (ADR-020 decision 5).
 *
 * Decisions follow what reaches the plan. An accepted suggestion travels with
 * the form and is recorded "accepted" once Save has landed; Dismiss records
 * "dismissed" at once. Saving with a suggestion still open asks first, and a
 * suggestion saved past that way stays undecided, so it is back in its box the
 * next time the session is opened (owner's choice).
 *
 * `children` is the activity editor.
 */
export function FillWithCoach({
  sessionId,
  open: initiallyOpen,
  editor,
  rows,
  children,
}: {
  sessionId: string;
  /** A suggestion for this session still waiting for an answer. */
  open?: FillProposal;
  editor: RefObject<ActivityEditorHandle | null>;
  /** The activity list as it is now. */
  rows: readonly EditorRow[];
  children: React.ReactNode;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<Open | null>(() => fromPlan(initiallyOpen));
  /** Suggestions accepted into the list, recorded when Save lands. */
  const [accepted, setAccepted] = useState<readonly string[]>([]);

  // The Plan's read decides what is open whenever it changes, because it can
  // arrive after this form was built: a save remounts the form in the same
  // commit as its result, which may be before the refreshed Plan reaches it.
  // A suggestion asked for here is left alone — the refreshed read returns
  // the same one. Adjusted during render, like the Plan's other reset keys.
  const incomingId = initiallyOpen?.proposalId ?? null;
  const [seenIncoming, setSeenIncoming] = useState(incomingId);
  if (incomingId !== seenIncoming) {
    setSeenIncoming(incomingId);
    const next = fromPlan(initiallyOpen);
    if (
      next !== null &&
      open?.proposal.proposalId !== next.proposal.proposalId
    ) {
      setOpen(next);
    } else if (next === null && open?.fromPlan) {
      setOpen(null);
    }
  }
  const [message, setMessage] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  const [dismissing, startDismissing] = useTransition();
  // Kept until the coach gives a definite answer, so asking again after a
  // lost response or a "still working" replays that request instead of
  // paying for a second one.
  const requestKey = useRef<string | null>(null);

  const box = useRef<HTMLElement | null>(null);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [heldSave, setHeldSave] = useState<{
    submitter: HTMLElement | null;
  } | null>(null);
  const saveAnyway = useRef(false);
  const isOpen = useRef(false);
  useEffect(() => {
    isOpen.current = open !== null;
  }, [open]);

  // Save with a suggestion still open is held once, so the owner is told the
  // suggestion stays unanswered and the list saves as it is. The listener
  // sits on the form itself: it runs before the event bubbles to the root
  // where React starts the form's action, so stopping it there is what keeps
  // the action from running. The owner's choice then resubmits with the same
  // button, which matters on a recurring session's two-scope form.
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    function onSubmit(event: SubmitEvent) {
      if (!isOpen.current || saveAnyway.current) {
        saveAnyway.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setHeldSave({ submitter: event.submitter });
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  function ask() {
    const idempotencyKey = requestKey.current ?? crypto.randomUUID();
    requestKey.current = idempotencyKey;
    setMessage(null);
    startAsking(async () => {
      try {
        const result = await fillSessionActivitiesAction({
          sessionId,
          note,
          idempotencyKey,
        });
        if (result.status === "pending") {
          setMessage(result.message);
          return;
        }
        requestKey.current = null;
        if (result.status === "refused") {
          setMessage(result.message);
          return;
        }
        setOpen({
          proposal: result.proposal,
          removed: new Set(),
          added: [],
          fromPlan: false,
        });
      } catch {
        setMessage(COPY.lost);
      }
    });
  }

  function toggleRemoved(index: number) {
    if (!open) return;
    const removed = new Set(open.removed);
    if (removed.has(index)) removed.delete(index);
    else removed.add(index);
    setOpen({ ...open, removed });
  }

  function accept() {
    if (!open) return;
    const list: ActivityValue[] = [
      ...open.proposal.activities.filter(
        (_activity, index) => !open.removed.has(index),
      ),
      ...addedNow.map((row) => row.value),
    ];
    editor.current?.replace(list);
    // Only the list the editor now holds can be saved, so only its suggestion
    // is recorded: one accepted earlier was replaced by this one.
    setAccepted([open.proposal.proposalId]);
    setOpen(null);
    setHeldSave(null);
    setMessage(list.length === 0 ? COPY.acceptedEmpty : COPY.acceptedMessage);
  }

  function dismiss() {
    if (!open) return;
    const dismissed = open;
    const { proposalId } = dismissed.proposal;
    answeredOnThisPage.add(proposalId);
    setOpen(null);
    setHeldSave(null);
    // The box closes at once and comes back if the dismissal was not
    // recorded, so what the owner sees matches what is stored.
    const reopen = (message: string) => {
      answeredOnThisPage.delete(proposalId);
      setOpen(dismissed);
      setMessage(message);
    };
    startDismissing(async () => {
      try {
        const result = await dismissSessionActivitiesAction(proposalId);
        if (result.status === "refused") reopen(result.message);
        else setMessage(result.message);
      } catch {
        reopen(COPY.dismissLost);
      }
    });
  }

  function saveWithoutSuggestion() {
    const form = anchor.current?.closest("form");
    const submitter = heldSave?.submitter ?? null;
    setHeldSave(null);
    saveAnyway.current = true;
    if (submitter instanceof HTMLButtonElement) form?.requestSubmit(submitter);
    else form?.requestSubmit();
  }

  // Planned activities added to the suggestion, as the list reads now: one
  // changed since is taken as changed, and one deleted since is gone here too.
  const live = new Map(rows.map((row) => [row.key, row.value]));
  const addedNow: EditorRow[] = (open?.added ?? []).flatMap((row) => {
    const value = live.get(row.key);
    return value === undefined ? [] : [{ key: row.key, value }];
  });
  const addedKeys = new Set(addedNow.map((row) => row.key));
  const draftCount =
    open === null
      ? 0
      : open.proposal.activities.length - open.removed.size + addedNow.length;

  return (
    <>
      <span ref={anchor} hidden />
      {accepted.map((id) => (
        <input key={id} type="hidden" name={PROPOSAL_FIELD} value={id} />
      ))}

      {open === null ? (
        <section className={styles.ask} aria-label={COPY.askLabel}>
          <div className={styles.field}>
            <label htmlFor={`fill-note-${sessionId}`}>{COPY.noteLabel}</label>
            {/* No `name`: the note goes to the coach, never into the session. */}
            <textarea
              id={`fill-note-${sessionId}`}
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              rows={2}
              placeholder={COPY.notePlaceholder}
              onChange={(event) => {
                setNote(event.target.value);
                // A different note is a different request.
                requestKey.current = null;
              }}
            />
          </div>
          <button
            className={styles.askButton}
            type="button"
            disabled={asking || dismissing}
            onClick={ask}
          >
            {asking ? COPY.asking : COPY.ask}
          </button>
        </section>
      ) : (
        <section
          ref={box}
          className={styles.suggestion}
          aria-label={COPY.suggestionLabel}
        >
          <p className={styles.eyebrow}>
            {COPY.suggestionLabel}
            {open.proposal.isExample ? (
              <span className={styles.example}>{COPY.example}</span>
            ) : null}
          </p>
          {open.proposal.isExample ? (
            <p className={styles.exampleSupport}>{COPY.exampleSupport}</p>
          ) : null}
          <p className={styles.summary}>{open.proposal.summary}</p>
          {open.proposal.safetyConsiderations.length === 0 ? null : (
            <ul className={styles.safety} aria-label={COPY.safetyLabel}>
              {open.proposal.safetyConsiderations.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}

          <p className={styles.hint}>{COPY.draftHint}</p>
          <ul className={styles.draft} aria-label={COPY.draftLabel}>
            {open.proposal.activities.map((activity, index) => {
              const removed = open.removed.has(index);
              return (
                <li key={`coach-${index}`} data-removed={removed}>
                  <span className={styles.itemText}>
                    <span className={styles.itemName}>{activity.name}</span>
                    <span className={styles.itemDetail}>
                      {removed
                        ? COPY.removedDetail
                        : (describeMeasurement(activity.target) ??
                          activity.sport)}
                    </span>
                    {removed ? null : (
                      <span className={styles.itemWhy}>
                        {open.proposal.rationales[index]}
                      </span>
                    )}
                  </span>
                  <button
                    className={styles.itemButton}
                    type="button"
                    aria-label={`${removed ? COPY.undo : COPY.remove} ${activity.name}`}
                    onClick={() => toggleRemoved(index)}
                  >
                    {removed ? COPY.undo : COPY.remove}
                  </button>
                </li>
              );
            })}
            {addedNow.map((row) => (
              <li key={row.key} data-origin="planned">
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{row.value.name}</span>
                  <span className={styles.itemDetail}>
                    {COPY.fromPlan} ·{" "}
                    {describeMeasurement(row.value.target) ?? row.value.sport}
                  </span>
                </span>
                <button
                  className={styles.itemButton}
                  type="button"
                  aria-label={`${COPY.remove} ${row.value.name}`}
                  onClick={() =>
                    setOpen({
                      ...open,
                      added: open.added.filter((item) => item.key !== row.key),
                    })
                  }
                >
                  {COPY.remove}
                </button>
              </li>
            ))}
          </ul>

          {rows.length === 0 ? null : (
            <>
              <h4 className={styles.plannedLabel}>{COPY.plannedLabel}</h4>
              <ul className={styles.planned} aria-label={COPY.plannedLabel}>
                {rows.map((row) => {
                  const inDraft = addedKeys.has(row.key);
                  return (
                    <li key={row.key}>
                      <span className={styles.itemText}>
                        <span className={styles.itemName}>
                          {row.value.name.trim() === ""
                            ? COPY.unnamed
                            : row.value.name}
                        </span>
                        <span className={styles.itemDetail}>
                          {describeMeasurement(row.value.target) ??
                            row.value.sport}
                        </span>
                      </span>
                      <button
                        className={styles.itemButton}
                        type="button"
                        disabled={inDraft}
                        aria-label={`${COPY.add} ${row.value.name}`}
                        onClick={() =>
                          setOpen({ ...open, added: [...open.added, row] })
                        }
                      >
                        {inDraft ? COPY.addedToDraft : COPY.add}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className={styles.decide}>
            <button className={styles.accept} type="button" onClick={accept}>
              {COPY.accept}
            </button>
            <button
              className={styles.dismiss}
              type="button"
              disabled={dismissing}
              onClick={dismiss}
            >
              {COPY.dismiss}
            </button>
          </div>
          <p className={styles.hint}>{COPY.decideHint(draftCount)}</p>
        </section>
      )}

      <p className={styles.message} role="status" aria-live="polite">
        {message ?? ""}
      </p>

      {children}

      {heldSave === null || open === null ? null : (
        <section className={styles.held} role="alert">
          <p>{COPY.heldText}</p>
          <div className={styles.decide}>
            <button
              className={styles.accept}
              type="button"
              onClick={saveWithoutSuggestion}
            >
              {COPY.saveAnyway}
            </button>
            <button
              className={styles.dismiss}
              type="button"
              onClick={() => {
                setHeldSave(null);
                box.current?.scrollIntoView({ block: "start" });
              }}
            >
              {COPY.backToSuggestion}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

const COPY = {
  askLabel: "Fill with coach",
  noteLabel: "Note for the coach (optional)",
  notePlaceholder: "Anything for this session only, e.g. keep it short",
  ask: "Fill with coach",
  asking: "Asking the coach…",
  lost: "The coach's answer did not arrive. Try again: the same request is not charged twice.",
  dismissLost:
    "The dismissal did not go through, so the suggestion is still open. Try again.",
  suggestionLabel: "Coach's suggestion",
  example: "Example",
  exampleSupport:
    "No coaching provider is configured, so the built-in example coach wrote this. It is not real coaching.",
  safetyLabel: "Safety",
  draftLabel: "Suggested activities",
  draftHint: "Your activity list below does not change until you press Accept.",
  remove: "Remove",
  undo: "Undo",
  removedDetail: "Removed",
  fromPlan: "From your plan",
  plannedLabel: "Currently planned",
  unnamed: "New activity",
  add: "Add",
  addedToDraft: "Added",
  accept: "Accept",
  dismiss: "Dismiss",
  decideHint: (count: number) =>
    count === 0
      ? "Accept empties your activity list. Dismiss closes this and leaves your list as it is."
      : `Accept replaces your activity list with the ${count} ${count === 1 ? "activity" : "activities"} above. Dismiss closes this and leaves your list as it is.`,
  acceptedEmpty:
    "Your activity list is now empty. Save session to keep it that way.",
  acceptedMessage:
    "Your activity list now holds the accepted activities. Save session to keep them.",
  heldText:
    "The coach's suggestion is still open. If you save now, your activity list is saved as it is and the suggestion stays unanswered: it will be here again next time you edit this session.",
  saveAnyway: "Save without it",
  backToSuggestion: "Back to the suggestion",
} as const;
