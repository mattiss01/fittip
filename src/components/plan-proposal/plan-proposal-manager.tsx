"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  generatePlanProposalAction,
  rejectPlanProposalAction,
} from "@/app/home/plan/proposal/actions";
import {
  INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  type PlanProposalActionState,
} from "@/app/home/plan/proposal/action-state";
import styles from "@/app/home/plan/proposal/proposal.module.css";
import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  RENDER_GRACE_MS,
  WATCH_INTERVAL_MS,
} from "@/features/goals/mutation-watchdog";
import { isoDateInTimezone } from "@/features/completions/local-date";
import { PLAN_PROPOSAL_COPY } from "@/features/plan-proposal/plan-proposal-copy";

type PlanProposalSummary = {
  id: string;
  weekDescription: string;
  assumptions: string[];
  uncertainties: {
    statement: string;
    whyItMatters: string;
    whatToWatch: string;
  }[];
  safetyConsiderations: string[];
};

export function PlanProposalManager({
  rememberedDayCount,
  proposal,
  proposalDays,
  contextSummary,
  openMemoryCandidateCount,
}: {
  rememberedDayCount: number;
  proposal: PlanProposalSummary | null;
  proposalDays: React.ReactNode;
  contextSummary: { goals: number; memory: number; recentSessions: number };
  openMemoryCandidateCount: number;
}) {
  const [state, formAction, generatePending] = useActionState(
    generatePlanProposalAction,
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const [decisionState, setDecisionState] = useState<PlanProposalActionState>(
    INITIAL_PLAN_PROPOSAL_ACTION_STATE,
  );
  const [decisionPending, setDecisionPending] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [dayCount, setDayCount] = useState(rememberedDayCount);
  const browserContext = useSyncExternalStore(
    subscribeNothing,
    readBrowserContext,
    () => "|",
  );
  const [timezoneName, today] = browserContext.split("|");
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const lostRender = useLostRenderRecovery(generatePending || decisionPending);

  async function reject() {
    if (!proposal) return;
    setDecisionPending(true);
    const result = await rejectPlanProposalAction(proposal.id);
    setDecisionState(result);
    setDecisionPending(false);
    setConfirmReject(false);
  }

  const visibleState = decisionState.status === "idle" ? state : decisionState;

  if (visibleState.status === "safety-hold") {
    return (
      <section className={styles.safetyHold} aria-live="polite">
        <p className={styles.sectionLabel}>Conservative pause</p>
        <h2>{PLAN_PROPOSAL_COPY.safetyHoldTitle}</h2>
        <p>{PLAN_PROPOSAL_COPY.safetyHoldBody}</p>
        <Link href="/home/today">Return to Today</Link>
      </section>
    );
  }

  return (
    <div className={styles.manager}>
      {lostRender ? (
        <p className={styles.notice} data-tone="warning" role="status">
          A reply arrived but the screen did not update. Reloading to show the
          current proposal state.
        </p>
      ) : null}
      {visibleState.message ? (
        <p
          className={styles.notice}
          data-tone={visibleState.status === "proposal" ? "success" : "warning"}
          role="status"
        >
          {visibleState.message}
        </p>
      ) : null}

      {proposal ? (
        <section className={styles.review} aria-labelledby="proposal-title">
          <p className={styles.sectionLabel}>Proposal · nothing accepted</p>
          <h2 id="proposal-title">A shape for these days.</h2>
          <p className={styles.weekDescription}>{proposal.weekDescription}</p>
          {proposalDays}

          {proposal.assumptions.length ? (
            <details className={styles.reviewNotes}>
              <summary>Assumptions</summary>
              <ul>
                {proposal.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {proposal.uncertainties.length ? (
            <details className={styles.reviewNotes}>
              <summary>Uncertainties</summary>
              {proposal.uncertainties.map((item) => (
                <div key={item.statement} className={styles.uncertainty}>
                  <strong>{item.statement}</strong>
                  <p>{item.whyItMatters}</p>
                  <p>Watch: {item.whatToWatch}</p>
                </div>
              ))}
            </details>
          ) : null}
          {proposal.safetyConsiderations.length ? (
            <section
              className={styles.safetyNotes}
              aria-labelledby="safety-notes-title"
            >
              <h3 id="safety-notes-title">Safety considerations</h3>
              <ul>
                {proposal.safetyConsiderations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {openMemoryCandidateCount > 0 ? (
            <aside className={styles.memoryPanel}>
              <h3>Possible memory updates</h3>
              <p>
                {openMemoryCandidateCount} note{" "}
                {openMemoryCandidateCount === 1 ? "needs" : "need"} your review.
                None is active yet.
              </p>
              <Link href="/home/you/memory">Review memory</Link>
            </aside>
          ) : null}

          <div className={styles.actionDock}>
            <p>This stays separate from your accepted plan.</p>
            <button
              className={styles.primaryAction}
              onClick={() => setContinueOpen(true)}
              type="button"
            >
              Continue
            </button>
            <button
              className={styles.secondaryAction}
              disabled={decisionPending}
              onClick={() => setConfirmReject(true)}
              type="button"
            >
              {PLAN_PROPOSAL_COPY.rejectAction}
            </button>
          </div>

          {continueOpen ? (
            <div
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="continue-title"
            >
              <h3 id="continue-title">Proposal saved for review</h3>
              <p>
                Editing, locking and accepting this proposal belong to M3-04.
                Nothing in your accepted plan changed.
              </p>
              <button
                className={styles.primaryAction}
                onClick={() => setContinueOpen(false)}
                type="button"
              >
                Keep reviewing
              </button>
            </div>
          ) : null}
          {confirmReject ? (
            <div
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-title"
            >
              <h3 id="reject-title">Reject proposal?</h3>
              <p>{PLAN_PROPOSAL_COPY.rejectConfirm}</p>
              <button
                className={styles.secondaryAction}
                disabled={decisionPending}
                onClick={reject}
                type="button"
              >
                {decisionPending
                  ? "Rejecting..."
                  : PLAN_PROPOSAL_COPY.rejectAction}
              </button>
              <button
                className={styles.quietAction}
                onClick={() => setConfirmReject(false)}
                type="button"
              >
                Keep proposal
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <form
          action={formAction}
          className={styles.compose}
          key={`empty-${state.submission}`}
          onSubmit={() => {
            if (idempotencyInput.current) {
              idempotencyInput.current.value = newIdempotencyKey();
            }
          }}
        >
          <p className={styles.sectionLabel}>Selected horizon</p>
          <h2>{PLAN_PROPOSAL_COPY.composeTitle}</h2>
          <p className={styles.helper}>
            Choose 1–7 consecutive local dates. The coach proposes sessions;
            nothing becomes accepted.
          </p>

          <fieldset className={styles.dayCount}>
            <legend>Days to propose</legend>
            {[1, 2, 3, 4, 5, 6, 7].map((count) => (
              <label key={count} data-selected={dayCount === count}>
                <input
                  checked={dayCount === count}
                  name="dayCount"
                  onChange={() => setDayCount(count)}
                  type="radio"
                  value={count}
                />
                <span>{count}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.field}>
            Start date
            <input
              className={styles.input}
              disabled={!today}
              min={today}
              name="startDate"
              defaultValue={today}
              key={today}
              required
              type="date"
            />
          </label>
          <label className={styles.field}>
            {PLAN_PROPOSAL_COPY.planningNoteLabel}
            <textarea
              className={styles.textarea}
              defaultValue={state.draft?.planningNote ?? ""}
              maxLength={1000}
              name="planningNote"
            />
            <span className={styles.helper}>
              {PLAN_PROPOSAL_COPY.planningNoteHelper}
            </span>
          </label>
          <details className={styles.disclosure}>
            <summary>{PLAN_PROPOSAL_COPY.contextSummaryLabel}</summary>
            <dl>
              <div>
                <dt>Active goals</dt>
                <dd>{contextSummary.goals}</dd>
              </div>
              <div>
                <dt>Accepted memory</dt>
                <dd>{contextSummary.memory}</dd>
              </div>
              <div>
                <dt>Recent sessions</dt>
                <dd>{contextSummary.recentSessions}</dd>
              </div>
            </dl>
            <p>
              Only active, accepted information and bounded training history are
              included. No roadmap is required.
            </p>
          </details>
          <input name="timezoneName" type="hidden" value={timezoneName} />
          <input
            defaultValue=""
            name="idempotencyKey"
            ref={idempotencyInput}
            type="hidden"
          />
          <button
            className={styles.primaryAction}
            disabled={generatePending || !today}
            type="submit"
          >
            {generatePending
              ? PLAN_PROPOSAL_COPY.pending
              : PLAN_PROPOSAL_COPY.generateAction}
          </button>
        </form>
      )}
    </div>
  );
}

function newIdempotencyKey(): string {
  return `pk_${crypto.randomUUID().replaceAll("-", "")}`;
}

function subscribeNothing() {
  return () => {};
}

function readBrowserContext(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${zone}|${isoDateInTimezone(new Date(), zone)}`;
}

function useLostRenderRecovery(pending: boolean): boolean {
  const [lost, setLost] = useState(false);
  const respondedAt = useRef<number | null>(null);
  const consumedAt = useRef<number | null>(null);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const actionUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (
        seen !== null &&
        (respondedAt.current === null || seen > respondedAt.current)
      )
        respondedAt.current = seen;
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    let reload = 0;
    const interval = window.setInterval(() => {
      const arrived = respondedAt.current;
      if (
        arrived === null ||
        (consumedAt.current !== null && arrived <= consumedAt.current) ||
        performance.now() - arrived < RENDER_GRACE_MS
      )
        return;
      window.clearInterval(interval);
      setLost(true);
      reload = window.setTimeout(
        () => window.location.reload(),
        RECOVERY_NOTICE_MS,
      );
    }, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [pending]);
  return lost && pending;
}
