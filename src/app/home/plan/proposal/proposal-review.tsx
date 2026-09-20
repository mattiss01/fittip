"use client";

import { useActionState } from "react";

import {
  INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  type PlanProposalActionState,
} from "./action-state";
import {
  decidePlanProposalItemAction,
  discardPlanProposalAction,
  finishPlanReviewAction,
} from "./actions";
import styles from "./proposal.module.css";
import type {
  PlannedSessionSummary,
  ProposalTimelineDay,
} from "./proposal-timeline";

import { INITIAL_PLAN_ACTION_STATE } from "../action-state";
import { changePlanAction } from "../actions";
import { SessionFields } from "../session-fields";

import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import type {
  PlanProposalItemDecision,
  PlanProposalItemView,
  ProposalRoadmapView,
} from "@/lib/plan/plan-proposal-view";

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
  expectedPlanRevision,
  finishKey,
  days,
  roadmap,
  planChangedSinceComposed,
  unresolved,
  staged,
  isExample,
}: {
  proposalId: string;
  expectedPlanRevision: number;
  /** Stable per render of the open proposal, so a retried finish replays. */
  finishKey: string;
  days: ProposalTimelineDay[];
  roadmap: ProposalRoadmapView | null;
  planChangedSinceComposed: boolean;
  unresolved: number;
  staged: number;
  isExample: boolean;
}) {
  const [state, action, pending] = useActionState(
    finishPlanReviewAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const [discardState, discardAction, discarding] = useActionState(
    discardPlanProposalAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );

  const notice = latest(state, discardState);

  return (
    <section className={styles.review} aria-label={COPY.reviewTitle}>
      {isExample ? (
        <p className={styles.exampleNotice} data-state="example">
          <strong>{COPY.exampleBadge}</strong> {COPY.exampleSupport}
        </p>
      ) : null}

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

      {roadmap === null ? null : (
        <section className={styles.roadmapNotice} data-state="roadmap">
          <h2>{COPY.roadmapHeading}</h2>
          <p className={styles.support}>
            {roadmap.isSuperseded
              ? COPY.roadmapSuperseded(roadmap.versionNumber)
              : COPY.roadmapPlannedUnder(
                  roadmap.title ?? "",
                  roadmap.versionNumber,
                )}
          </p>
          {roadmap.staleReasons.length > 0 ? (
            <ul className={styles.staleReasons}>
              {roadmap.staleReasons.map((reason) => (
                <li key={reason}>
                  <strong>{COPY.roadmapStaleLead}</strong>{" "}
                  {reason === "out_of_window"
                    ? COPY.roadmapStaleOutOfWindow
                    : COPY.roadmapStaleGoalMissing}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

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

      <div className={`${styles.dock} save-dock`}>
        <p className={styles.dockSupport}>
          {unresolved > 0
            ? COPY.unresolvedSupport(unresolved)
            : COPY.finishSupport(staged)}
        </p>
        <div className={styles.dockActions}>
          <form action={action} key={`finish-${state.submission}`}>
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
              disabled={pending || discarding || unresolved > 0}
            >
              {COPY.finishAction}
            </button>
          </form>
          <form
            action={discardAction}
            key={`discard-${discardState.submission}`}
          >
            <input type="hidden" name="proposalId" value={proposalId} />
            <button
              className={styles.dangerAction}
              type="submit"
              disabled={pending || discarding}
              // A confirmation only when something would actually be lost, and
              // it says exactly how much.
              onClick={(event) => {
                if (staged > 0 && !confirm(COPY.discardConfirm(staged))) {
                  event.preventDefault();
                }
              }}
            >
              {COPY.discardAction}
            </button>
          </form>
        </div>
        <p
          className={notice.status === "idle" ? styles.srOnly : styles.notice}
          data-state={pending || discarding ? "pending" : notice.status}
          role="status"
          aria-live="polite"
        >
          {pending
            ? "Applying your choices…"
            : discarding
              ? "Discarding…"
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
 * surface would carry; and a proposal horizon is at most seven days from today
 * while the plan window is fourteen, so every session shown here is inside the
 * window that action reads.
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
}: {
  session: PlannedSessionSummary;
  expectedPlanRevision: number;
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
    >
      <header className={styles.cardHeader}>
        <h3>{session.title}</h3>
        <span className={styles.badge} data-kind="planned">
          {COPY.alreadyPlannedBadge}
        </span>
      </header>
      <p className={styles.meta}>
        {[
          session.sport,
          session.expectedDurationMinutes === null
            ? null
            : `${session.expectedDurationMinutes} min`,
          session.isLocked ? COPY.lockedBadge : null,
          cancelled ? COPY.cancelledBadge : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {cancelled ? null : (
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

          <form action={action}>
            <input type="hidden" name="operation" value="set_lock" />
            <input type="hidden" name="sessionId" value={session.id} />
            <input
              type="hidden"
              name="isLocked"
              value={session.isLocked ? "false" : "true"}
            />
            <input
              type="hidden"
              name="expectedRevision"
              value={expectedPlanRevision}
            />
            <button
              className={styles.secondary}
              type="submit"
              disabled={pending}
              aria-label={
                session.isLocked
                  ? COPY.unlockPlannedActionFor(session.title)
                  : COPY.lockPlannedActionFor(session.title)
              }
            >
              {session.isLocked
                ? COPY.unlockPlannedAction
                : COPY.lockPlannedAction}
            </button>
          </form>
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
  item: PlanProposalItemView;
}) {
  const [state, action, pending] = useActionState(
    decidePlanProposalItemAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );

  const isRecoveryDay = item.kind === "recovery_day";
  const title = isRecoveryDay ? COPY.recoveryDayTitle : (item.title ?? "");

  return (
    <article className={styles.proposed} data-decision={item.decision}>
      <header className={styles.cardHeader}>
        <h3>{title}</h3>
        <span className={styles.badge} data-kind={item.decision}>
          {item.decision === "staged"
            ? COPY.stagedBadge
            : item.decision === "rejected"
              ? COPY.rejectedBadge
              : COPY.proposedBadge}
        </span>
      </header>

      {isRecoveryDay ? (
        <p className={styles.body}>{COPY.recoveryDaySupport}</p>
      ) : (
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
      )}

      <form
        className={styles.choices}
        action={action}
        key={`decide-${item.ordinal}-${state.submission}`}
      >
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="ordinal" value={item.ordinal} />
        <ChoiceButton
          decision="staged"
          current={item.decision}
          pending={pending}
          label={COPY.stageAction}
          accessibleLabel={COPY.stageActionFor(title)}
        />
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
function latest(
  finish: PlanProposalActionState,
  discard: PlanProposalActionState,
): PlanProposalActionState {
  if (discard.submission === 0) return finish;
  if (finish.submission === 0) return discard;
  return discard.submission > finish.submission ? discard : finish;
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
