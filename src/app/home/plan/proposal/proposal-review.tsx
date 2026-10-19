"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  type PlanProposalActionState,
} from "./action-state";
import {
  decidePlanProposalItemAction,
  discardPlanProposalAction,
  finishPlanReviewAction,
  regeneratePlanProposalAction,
} from "./actions";
import styles from "./proposal.module.css";
import type {
  PlannedSessionSummary,
  ProposalReplacement,
  ProposalTimelineDay,
  ProposalTimelineItem,
} from "./proposal-timeline";

import { INITIAL_PLAN_ACTION_STATE } from "../action-state";
import { changePlanAction } from "../actions";
import { CancelReasonFields } from "../cancel-reason-fields";
import { SheetLayer } from "../plan-sheet";
import { SessionFields } from "../session-fields";

import { CoachSpark } from "@/components/home/coach-spark";
import {
  PLAN_PROPOSAL_COPY,
  PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH,
} from "@/lib/plan/plan-proposal-copy";
import type { PlanProposalItemDecision } from "@/lib/plan/plan-proposal-view";
import {
  MemorySuggestions,
  type MemorySuggestion,
} from "@/components/memory/memory-suggestions";

const COPY = PLAN_PROPOSAL_COPY;

/**
 * The review.
 *
 * One dock at the bottom owns the two actions that end the review, and every
 * item owns its own choice. That split is deliberate: a choice is cheap,
 * reversible and immediately saved, while the finish is the one irreversible
 * step, so they must not look alike or share a submission state.
 *
 * The finish control is disabled while any item is undecided and says how many
 * are left. The database refuses that case anyway, under the lock that also
 * writes the plan — this is so the owner is told before they press it, not so
 * the rule lives here.
 */
export function ProposalReview({
  proposalId,
  regenerationFeedback,
  weekDescription,
  safetyConsiderations,
  assumptions,
  uncertainties,
  nothingAdded,
  expectedPlanRevision,
  finishKey,
  days,
  planChangedSinceComposed,
  unresolved,
  staged,
  isExample,
  memory,
}: {
  proposalId: string;
  /** Present only on a proposal that replaced another one. */
  regenerationFeedback: string | null;
  /** The coach's overview of the days, in its own words. */
  weekDescription: string;
  /** What it held back on and why; shown open, never folded away. */
  safetyConsiderations: readonly string[];
  assumptions: readonly string[];
  uncertainties: readonly {
    statement: string;
    whyItMatters: string;
    whatToWatch: string;
  }[];
  /** The coach proposed no session, so there is nothing to decide. */
  nothingAdded: boolean;
  expectedPlanRevision: number;
  /** Stable per render of the open proposal, so a retried finish replays. */
  finishKey: string;
  days: ProposalTimelineDay[];
  planChangedSinceComposed: boolean;
  unresolved: number;
  staged: number;
  isExample: boolean;
  /** The coach's memory suggestions still open, asked about before an ending. */
  memory: { revision: number; suggestions: readonly MemorySuggestion[] };
}) {
  const [state, action, pending] = useActionState(
    finishPlanReviewAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const [discardState, discardAction, discarding] = useActionState(
    discardPlanProposalAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const [regenerateState, regenerateAction, regenerating] = useActionState(
    regeneratePlanProposalAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  // Closed until asked for. The box is the third ending of a review, not a
  // field the owner has to scroll past on the way to the other two.
  const [askingAgain, setAskingAgain] = useState(false);
  // What the owner has typed so far, for the count under the field.
  const [feedbackLength, setFeedbackLength] = useState(0);
  // One key per attempt. A failed one gets a new key, so pressing again asks
  // the coach rather than replaying the failure; past the deadline the call
  // may still be running, and the same key keeps it one charge.
  const [askKey, setAskKey] = useState(newAskKey);
  const [seenAskSubmission, setSeenAskSubmission] = useState(
    regenerateState.submission,
  );
  if (seenAskSubmission !== regenerateState.submission) {
    setSeenAskSubmission(regenerateState.submission);
    if (regenerateState.attemptEnded) setAskKey(newAskKey());
  }

  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // Open memory suggestions are put in front of the owner once before the
  // review ends (owner, 19 Oct 2026), so they are not left behind unseen.
  // A ref, not state: the second submit runs before a state update lands.
  const [memoryBeforeFinish, setMemoryBeforeFinish] = useState(false);
  const memoryShown = useRef(false);
  const finishForm = useRef<HTMLFormElement>(null);
  // Only this proposal's own: one left open from an earlier proposal waits in
  // the panel below and in Memory, and is not asked about at every review.
  const ownMemory = memory.suggestions.filter(
    (suggestion) => suggestion.proposalId === proposalId,
  );
  const openMemory = ownMemory.length > 0;
  const dialogId = useId();
  const discardTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirmingDiscard) discardTitle.current?.focus();
  }, [confirmingDiscard]);
  const dock = useDockReserve();
  const notice = latest(state, discardState, regenerateState);
  const busy = pending || discarding || regenerating;

  return (
    <section className={styles.review} aria-label={COPY.reviewTitle}>
      {isExample ? (
        <p className={styles.exampleNotice} data-state="example">
          <strong>{COPY.exampleBadge}</strong> {COPY.exampleSupport}
        </p>
      ) : null}

      {/*
        Above the week rather than below it: the owner is about to judge
        whether the coach did what they asked, and the question has to be on
        screen before the answer is.
      */}
      {regenerationFeedback === null ? null : (
        <p className={styles.regeneratedFrom}>
          {COPY.regeneratedFrom(regenerationFeedback)}
        </p>
      )}

      {/*
        The coach's reason for the days below, before them. With nothing
        added it is the whole answer, so it says that first.
      */}
      <section className={styles.coachNote} aria-label={COPY.coachNoteLabel}>
        {nothingAdded ? (
          <p className={styles.nothingAdded}>{COPY.nothingAdded}</p>
        ) : null}
        <p className={styles.weekDescription}>{weekDescription}</p>
        {/*
          Open, under the note: a referral to a physio folded away is one the
          owner never reads (17 Oct 2026, Tom's test). The M3-11 rebuild had
          left all three lists out.
        */}
        {safetyConsiderations.length === 0 ? null : (
          <div className={styles.safetyNotes}>
            <h3 className={styles.sectionLabel}>{COPY.safetyHeading}</h3>
            <ul>
              {safetyConsiderations.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        {assumptions.length === 0 && uncertainties.length === 0 ? null : (
          <details className={styles.coachMore}>
            <summary>{COPY.coachMoreSummary}</summary>
            {assumptions.length === 0 ? null : (
              <>
                <h3 className={styles.sectionLabel}>
                  {COPY.assumptionsHeading}
                </h3>
                <ul>
                  {assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </>
            )}
            {uncertainties.length === 0 ? null : (
              <>
                <h3 className={styles.sectionLabel}>
                  {COPY.uncertaintiesHeading}
                </h3>
                <ul>
                  {uncertainties.map((entry) => (
                    <li key={entry.statement}>
                      {entry.statement}{" "}
                      <span className={styles.sectionLabel}>
                        {COPY.whyItMattersLabel}
                      </span>{" "}
                      {entry.whyItMatters}{" "}
                      <span className={styles.sectionLabel}>
                        {COPY.whatToWatchLabel}
                      </span>{" "}
                      {entry.whatToWatch}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </details>
        )}
      </section>

      {/*
        Both notices are statements, not warnings with an action. The timeline
        below was read on this render, so the refresh the owner would reach for
        has already happened, and the finish revalidates under the lock either
        way. Telling them to reload would be asking for work already done.
      */}
      {planChangedSinceComposed ? (
        <p className={styles.staleNotice} data-state="plan-changed">
          {COPY.planChangedNotice}
        </p>
      ) : null}

      <ol className={styles.days}>
        {days.map((day) => (
          <li
            className={styles.day}
            key={day.localDate}
            data-today={day.isToday}
          >
            <p className={styles.dayStamp}>
              {formatDay(day.localDate)}
              {day.isToday ? (
                <span className={styles.dayMark}>Today</span>
              ) : null}
              {day.isRecoveryDay ? (
                <span className={styles.recoveryStamp}>
                  {COPY.recoveryDayAlreadyBadge}
                </span>
              ) : null}
            </p>

            <div className={styles.dayBody}>
              {day.planned.map((session) => (
                <PlannedSession
                  key={session.id}
                  session={session}
                  expectedPlanRevision={expectedPlanRevision}
                  isPast={day.isPast}
                  replacement={day.replacements[session.id] ?? null}
                />
              ))}

              {day.items.map((item) => (
                <ProposedItem
                  key={`${proposalId}-${item.ordinal}`}
                  proposalId={proposalId}
                  item={item}
                />
              ))}

              {day.planned.length === 0 && day.items.length === 0 ? (
                <p className={styles.empty}>Nothing planned or proposed.</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className={`${styles.dock} save-dock`} ref={dock}>
        {/* About finishing, so not while asking again (owner, 19 Oct 2026). */}
        {askingAgain ? null : (
          <p className={styles.dockSupport}>
            {unresolved > 0
              ? COPY.unresolvedSupport(unresolved)
              : COPY.finishSupport(staged)}
          </p>
        )}
        {askingAgain ? null : (
          <div className={styles.dockActions}>
            <form
              action={action}
              key={`finish-${state.submission}`}
              ref={finishForm}
              onSubmit={(event) => {
                if (openMemory && !memoryShown.current) {
                  event.preventDefault();
                  memoryShown.current = true;
                  setMemoryBeforeFinish(true);
                }
              }}
            >
              <input type="hidden" name="proposalId" value={proposalId} />
              <input
                type="hidden"
                name="expectedPlanRevision"
                value={expectedPlanRevision}
              />
              <input type="hidden" name="idempotencyKey" value={finishKey} />
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || unresolved > 0}
              >
                {COPY.finishAction}
              </button>
            </form>
            {/* Always asked first (owner, 9 Oct 2026): a discarded proposal
                leaves nothing on the page, so the question is the one place
                that says what the press does. */}
            <button
              className={styles.dangerAction}
              type="button"
              aria-haspopup="dialog"
              disabled={busy}
              onClick={() => setConfirmingDiscard(true)}
            >
              {COPY.discardAction}
            </button>
            <button
              className={styles.quietAction}
              type="button"
              disabled={busy}
              onClick={() => setAskingAgain(true)}
            >
              <CoachSpark size={16} />
              {COPY.regenerateOpen}
            </button>
          </div>
        )}

        {memoryBeforeFinish ? (
          <SheetLayer
            view="memory-before-finish"
            placement="center"
            labelledBy={`${dialogId}-memory`}
            onClose={() => setMemoryBeforeFinish(false)}
          >
            <div className={styles.goalPrompt}>
              <h2 id={`${dialogId}-memory`}>{COPY.memoryBeforeEndTitle}</h2>
              <p>{COPY.memoryBeforeEndSupport}</p>
              <MemorySuggestions
                suggestions={ownMemory}
                expectedRevision={memory.revision}
              />
              <button
                className={styles.primary}
                type="button"
                onClick={() => {
                  setMemoryBeforeFinish(false);
                  finishForm.current?.requestSubmit();
                }}
              >
                {COPY.finishAction}
              </button>
              <button
                className={styles.quietAction}
                type="button"
                onClick={() => setMemoryBeforeFinish(false)}
              >
                {COPY.discardCancel}
              </button>
            </div>
          </SheetLayer>
        ) : null}

        {confirmingDiscard ? (
          <SheetLayer
            view="discard-proposal"
            placement="center"
            labelledBy={`${dialogId}-discard`}
            onClose={() => setConfirmingDiscard(false)}
          >
            <div className={styles.goalPrompt}>
              <h2 id={`${dialogId}-discard`} ref={discardTitle} tabIndex={-1}>
                {COPY.discardConfirmTitle}
              </h2>
              <p>{COPY.discardConfirm(staged)}</p>
              {openMemory ? (
                <>
                  <p>{COPY.memoryBeforeEndSupport}</p>
                  <MemorySuggestions
                    suggestions={ownMemory}
                    expectedRevision={memory.revision}
                  />
                </>
              ) : null}
              <form
                // The question closes as the answer is sent; what comes back
                // is shown by the dock's own notice.
                action={(formData) => {
                  setConfirmingDiscard(false);
                  discardAction(formData);
                }}
                key={`discard-${discardState.submission}`}
              >
                <input type="hidden" name="proposalId" value={proposalId} />
                <button className={styles.dangerAction} type="submit">
                  {COPY.discardConfirmAction}
                </button>
              </form>
              <button
                className={styles.quietAction}
                type="button"
                onClick={() => setConfirmingDiscard(false)}
              >
                {COPY.discardCancel}
              </button>
            </div>
          </SheetLayer>
        ) : null}

        {/*
          The third way a review ends. It says plainly what happens to the two
          halves of the proposal, because "ask again" on its own does not tell
          the owner that what they added is safe and the rest is not.
        */}
        {askingAgain ? (
          // Not re-keyed per reply: after a failure the proposal is still
          // here (owner, 17 Oct 2026), and so is what the owner typed.
          <form className={styles.regenerate} action={regenerateAction}>
            <h3>{COPY.regenerateHeading}</h3>
            <input type="hidden" name="proposalId" value={proposalId} />
            <input type="hidden" name="idempotencyKey" value={askKey} />
            <label htmlFor="regenerationFeedback">{COPY.regenerateLabel}</label>
            <textarea
              id="regenerationFeedback"
              name="regenerationFeedback"
              maxLength={PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH}
              rows={3}
              required
              aria-describedby="regenerationFeedbackCount"
              onChange={(event) => setFeedbackLength(event.target.value.length)}
            />
            <p
              className={styles.helper}
              id="regenerationFeedbackCount"
              data-count
            >
              {COPY.regenerateCount(
                feedbackLength,
                PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH,
              )}
            </p>
            <div className={styles.dockActions}>
              <button className={styles.primary} type="submit" disabled={busy}>
                <CoachSpark size={16} />
                {COPY.regenerateSubmit}
              </button>
              <button
                className={styles.quietAction}
                type="button"
                disabled={busy}
                onClick={() => setAskingAgain(false)}
              >
                {COPY.regenerateCancel}
              </button>
            </div>
          </form>
        ) : null}
        <p
          className={notice.status === "idle" ? styles.srOnly : styles.notice}
          data-state={busy ? "pending" : notice.status}
          role="status"
          aria-live="polite"
        >
          {pending
            ? "Applying your choices…"
            : discarding
              ? "Discarding…"
              : regenerating
                ? COPY.regeneratePending
                : notice.message}
        </p>
      </div>
    </section>
  );
}

/**
 * A session the plan already holds, editable in place.
 *
 * The action is the plan surface's own `changePlanAction`, not a copy: the
 * revision check, the placement rules, the series divergence and the top-up
 * all live inside it, and a second write path to the same rows is a second set
 * of rules to keep true. Reuse is safe on two facts worth stating because
 * neither is local — `slice.revision` is the plan's revision and not a
 * window-scoped one, so the number this form carries is the one the plan
 * surface would carry; and a proposal horizon ends at most 36 days from today
 * (a first day up to 30 ahead, then seven days) while a session may sit 180
 * days out, so every session shown here is inside the window that action reads.
 *
 * Staged choices survive the save because they are rows in
 * `plan_proposal_item_decisions`, not component state. The revalidate that
 * follows re-reads them, and there is nothing in this tree for it to lose.
 *
 * A cancelled session is shown and not editable. Every non-destructive
 * operation refuses it today, so offering an editor would be offering a
 * control the server will decline; reactivating one is its own ticket.
 */
function PlannedSession({
  session,
  expectedPlanRevision,
  isPast,
  replacement,
}: {
  session: PlannedSessionSummary;
  expectedPlanRevision: number;
  isPast: boolean;
  /**
   * The proposed session that would replace this one, or the coach's
   * suggestion to cancel it (ADR-033), if either still can happen.
   */
  replacement: ProposalReplacement | null;
}) {
  const [state, action, pending] = useActionState(
    changePlanAction,
    INITIAL_PLAN_ACTION_STATE,
  );
  const cancelled = session.status === "cancelled";

  return (
    <article
      className={styles.planned}
      data-cancelled={cancelled}
      data-session-id={session.id}
      // "chosen" once the owner picked Replace or Cancel it: the card is
      // struck through, so what leaves the plan is plain at a glance (owner,
      // 9 Oct 2026). "offered" while the choice is still open.
      data-replaced={
        replacement === null
          ? undefined
          : replacement.isChosen
            ? "chosen"
            : "offered"
      }
    >
      <header className={styles.cardHeader}>
        <h3>{session.title}</h3>
        <span
          className={styles.badge}
          data-kind={
            replacement === null
              ? "planned"
              : replacement.isChosen
                ? "replaced"
                : "replaceable"
          }
        >
          {replacement === null
            ? COPY.alreadyPlannedBadge
            : replacement.kind === "cancel"
              ? replacement.isChosen
                ? COPY.willBeCancelledBadge
                : COPY.mayBeCancelledBadge
              : replacement.isChosen
                ? COPY.willBeReplacedBadge
                : COPY.mayBeReplacedBadge}
        </span>
      </header>
      <p className={styles.meta}>
        {[
          session.sport,
          session.expectedDurationMinutes === null
            ? null
            : `${session.expectedDurationMinutes} min`,
          cancelled ? COPY.cancelledBadge : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {replacement === null ? null : (
        <p className={styles.replacementNote}>
          {replacement.kind === "cancel"
            ? replacement.isChosen
              ? COPY.plannedWillBeCancelled
              : COPY.plannedMayBeCancelled
            : replacement.isChosen
              ? COPY.plannedWillBeReplaced(replacement.title)
              : COPY.plannedMayBeReplaced(replacement.title)}
        </p>
      )}

      {cancelled || isPast ? (
        isPast && !cancelled ? (
          <p className={styles.support} data-state="rule">
            {COPY.plannedPastDay}
          </p>
        ) : null
      ) : (
        <div className={styles.plannedActions}>
          <details className={styles.disclosure}>
            <summary>{COPY.editPlannedAction}</summary>
            <div className={styles.editorPanel}>
              {session.seriesId === null ? null : (
                <p className={styles.support} data-state="rule">
                  {COPY.editPlannedSeriesConsequence}
                </p>
              )}
              <form
                className={styles.form}
                action={action}
                key={`edit-${session.id}-${state.submission}`}
              >
                <input type="hidden" name="operation" value="edit" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedPlanRevision}
                />
                <SessionFields
                  idPrefix={`proposal-edit-${session.id}`}
                  draft={{
                    title: session.title,
                    sport: session.sport,
                    expectedDurationMinutes:
                      session.expectedDurationMinutes === null
                        ? ""
                        : String(session.expectedDurationMinutes),
                    intent: session.intent ?? "",
                    note: session.note ?? "",
                  }}
                  activities={session.activities}
                />
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={pending}
                >
                  {COPY.editPlannedSave}
                </button>
                <p className={styles.support}>{COPY.editPlannedSupport}</p>
              </form>
            </div>
          </details>
          <details className={styles.disclosure}>
            <summary>{COPY.cancelPlannedAction}</summary>
            <div className={styles.editorPanel}>
              <p className={styles.support} data-state="rule">
                {session.seriesId === null
                  ? COPY.cancelPlannedConsequence
                  : `${COPY.cancelPlannedConsequence} ${COPY.cancelPlannedSeriesConsequence}`}
              </p>
              <form
                className={styles.form}
                action={action}
                key={`cancel-${session.id}-${state.submission}`}
              >
                <input type="hidden" name="operation" value="cancel" />
                <input type="hidden" name="sessionId" value={session.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedPlanRevision}
                />
                <CancelReasonFields
                  idPrefix={`proposal-cancel-${session.id}`}
                />
                <button
                  className={styles.dangerAction}
                  type="submit"
                  disabled={pending}
                >
                  {COPY.cancelPlannedSubmit}
                </button>
              </form>
            </div>
          </details>
        </div>
      )}

      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={pending ? "pending" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving…" : state.message}
      </p>
    </article>
  );
}

/**
 * One proposed item and its three choices.
 *
 * Each item holds its own action state, so one card's reply never disturbs
 * another's, and the three buttons are three submissions of the same action
 * rather than a select: a choice should take one press.
 */
function ProposedItem({
  proposalId,
  item,
}: {
  proposalId: string;
  item: ProposalTimelineItem;
}) {
  const [state, action, pending] = useActionState(
    decidePlanProposalItemAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );

  if (item.kind === "cancel") {
    return <CancelItem proposalId={proposalId} item={item} />;
  }

  // Every other item is a proposed session since 17 Oct 2026; free days are
  // no longer offered as recovery days (owner).
  const title = item.title ?? "";
  // A session it can still stand in for. Once that session is logged,
  // cancelled or gone, the finish adds this one and deletes nothing, so the
  // choices fall back to the ordinary two and the card says why.
  const replaceable = item.replaces?.available ? item.replaces : null;
  const oldTitle = replaceable?.title ?? "";

  return (
    <article className={styles.proposed} data-decision={item.decision}>
      <header className={styles.cardHeader}>
        <h3>{title}</h3>
        <span className={styles.badge} data-kind={item.decision}>
          <CoachSpark size={13} />
          {item.decision === "staged"
            ? replaceable
              ? COPY.replaceBadge
              : COPY.stagedBadge
            : item.decision === "staged_beside"
              ? COPY.besideBadge
              : item.decision === "rejected"
                ? COPY.rejectedBadge
                : COPY.proposedBadge}
        </span>
      </header>

      <>
        <p className={styles.meta}>
          {[
            item.sport,
            item.expectedDurationMinutes === null
              ? null
              : `${item.expectedDurationMinutes} min`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.replaces === null ? null : replaceable ? (
          <p className={styles.rationale} data-replaces="available">
            <span className={styles.sectionLabel}>{COPY.replacesLabel}</span>{" "}
            {[
              replaceable.title,
              replaceable.expectedDurationMinutes === null
                ? null
                : `${replaceable.expectedDurationMinutes} min`,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        ) : (
          <p className={styles.rationale} data-replaces="unavailable">
            {COPY.replaceUnavailable(item.replaces.title)}
          </p>
        )}
        {item.intent === null ? null : (
          <p className={styles.body}>{item.intent}</p>
        )}
        {item.rationale === null ? null : (
          <p className={styles.rationale}>
            <span className={styles.sectionLabel}>{COPY.rationaleLabel}</span>{" "}
            {item.rationale}
          </p>
        )}
      </>

      <form
        className={styles.choices}
        action={action}
        key={`decide-${item.ordinal}-${state.submission}`}
      >
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="ordinal" value={item.ordinal} />
        {replaceable ? (
          <>
            <ChoiceButton
              decision="staged"
              current={item.decision}
              pending={pending}
              label={COPY.replaceAction}
              accessibleLabel={COPY.replaceActionFor(title, oldTitle)}
            />
            <ChoiceButton
              decision="staged_beside"
              current={item.decision}
              pending={pending}
              label={COPY.besideAction}
              accessibleLabel={COPY.besideActionFor(title, oldTitle)}
            />
          </>
        ) : (
          <ChoiceButton
            decision="staged"
            // "Add beside" chosen before the session went away is the same
            // outcome as this button now.
            current={
              item.decision === "staged_beside" ? "staged" : item.decision
            }
            pending={pending}
            label={COPY.stageAction}
            accessibleLabel={COPY.stageActionFor(title)}
          />
        )}
        <ChoiceButton
          decision="rejected"
          current={item.decision}
          pending={pending}
          label={COPY.rejectAction}
          accessibleLabel={COPY.rejectActionFor(title)}
        />
        <ChoiceButton
          decision="proposed"
          current={item.decision}
          pending={pending}
          label={COPY.resetAction}
          accessibleLabel={COPY.resetActionFor(title)}
        />
      </form>

      <p
        className={
          state.status === "idle" ? styles.srOnly : styles.inlineNotice
        }
        data-state={pending ? "pending" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving your choice…" : state.message}
      </p>
    </article>
  );
}

/**
 * A planned session the coach suggests calling off (ADR-033): its title, the
 * coach's reason, and two choices. Once the session is logged, cancelled or
 * gone, there is nothing to cancel, so only Keep is offered and the card says
 * why: the review still needs a choice before it can finish.
 */
function CancelItem({
  proposalId,
  item,
}: {
  proposalId: string;
  item: ProposalTimelineItem;
}) {
  const [state, action, pending] = useActionState(
    decidePlanProposalItemAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const title = item.replaces?.title ?? item.title ?? "";
  const available = item.replaces?.available === true;

  return (
    <article
      className={styles.proposed}
      data-decision={item.decision}
      data-kind="cancel"
    >
      <header className={styles.cardHeader}>
        <h3>{COPY.cancelItemTitle(title)}</h3>
        <span className={styles.badge} data-kind={item.decision}>
          <CoachSpark size={13} />
          {item.decision === "staged"
            ? COPY.willBeCancelledBadge
            : item.decision === "rejected"
              ? COPY.keptBadge
              : COPY.proposedBadge}
        </span>
      </header>
      {available ? null : (
        <p className={styles.rationale} data-replaces="unavailable">
          {COPY.cancelUnavailable(item.replaces?.title ?? null)}
        </p>
      )}
      {item.rationale === null ? null : (
        <p className={styles.rationale}>
          <span className={styles.sectionLabel}>{COPY.cancelReasonLabel}</span>{" "}
          {item.rationale}
        </p>
      )}

      <form
        className={styles.choices}
        action={action}
        key={`decide-${item.ordinal}-${state.submission}`}
      >
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="ordinal" value={item.ordinal} />
        {available ? (
          <ChoiceButton
            decision="staged"
            current={item.decision}
            pending={pending}
            label={COPY.cancelItemAction}
            accessibleLabel={COPY.cancelItemActionFor(title)}
          />
        ) : null}
        <ChoiceButton
          decision="rejected"
          current={item.decision}
          pending={pending}
          label={COPY.keepItemAction}
          accessibleLabel={COPY.keepItemActionFor(title)}
        />
        <ChoiceButton
          decision="proposed"
          current={item.decision}
          pending={pending}
          label={COPY.resetAction}
          accessibleLabel={COPY.resetActionFor(COPY.cancelItemTitle(title))}
        />
      </form>

      <p
        className={
          state.status === "idle" ? styles.srOnly : styles.inlineNotice
        }
        data-state={pending ? "pending" : state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving your choice…" : state.message}
      </p>
    </article>
  );
}

function ChoiceButton({
  decision,
  current,
  pending,
  label,
  accessibleLabel,
}: {
  decision: PlanProposalItemDecision;
  current: PlanProposalItemDecision;
  pending: boolean;
  label: string;
  accessibleLabel: string;
}) {
  const selected = current === decision;
  return (
    <button
      className={styles.choice}
      type="submit"
      name="decision"
      value={decision}
      aria-label={accessibleLabel}
      aria-pressed={selected}
      data-selected={selected}
      disabled={pending || selected}
    >
      {label}
    </button>
  );
}

/** Whichever of the two dock actions replied most recently. */
/**
 * The newest of however many endings have been attempted.
 *
 * Generalised from a pair when regeneration became the third: a fixed two-way
 * comparison would have silently kept showing the finish's notice while the
 * owner was looking at the result of asking again.
 */
function latest(...states: PlanProposalActionState[]): PlanProposalActionState {
  return states.reduce((newest, candidate) =>
    candidate.submission > newest.submission ? candidate : newest,
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDay(localDate: string): string {
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  return Number.isFinite(parsed)
    ? DAY_FORMAT.format(new Date(parsed))
    : localDate;
}

/**
 * Reserves exactly the room the dock takes, from its top edge to the bottom of
 * the viewport, so the last day can always be scrolled clear of it.
 *
 * The shell's fixed 16rem was measured for the dock's shortest text; a longer
 * support line ("Nothing is staged, …") or the open "ask again" box made it
 * taller, and the last day stayed underneath (owner, 17 Oct 2026). The height
 * goes to `--save-dock-reserve` on the document, which the shell reads, and
 * is removed with the review, so other docks keep the fixed reserve.
 */
function useDockReserve() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = ref.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      const reserve = window.innerHeight - dock.getBoundingClientRect().top;
      root.style.setProperty("--save-dock-reserve", `${Math.ceil(reserve)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--save-dock-reserve");
    };
  }, []);
  return ref;
}

function newAskKey(): string {
  return globalThis.crypto.randomUUID();
}
