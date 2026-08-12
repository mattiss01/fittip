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
    subscribeBrowserContext,
    readBrowserContext,
    () => "|",
  );
  const [timezoneName, today] = browserContext.split("|");
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
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
          <div
            aria-hidden={continueOpen || confirmReject ? true : undefined}
            inert={continueOpen || confirmReject ? true : undefined}
          >
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
                  {openMemoryCandidateCount === 1 ? "needs" : "need"} your
                  review. None is active yet.
                </p>
                <Link href="/home/you/memory">Review memory</Link>
              </aside>
            ) : null}

            <div className={styles.actionDock}>
              <p>This stays separate from your accepted plan.</p>
              <button
                className={styles.primaryAction}
                onClick={() => setContinueOpen(true)}
                ref={continueButton}
                type="button"
              >
                Continue
              </button>
              <button
                className={styles.secondaryAction}
                disabled={decisionPending}
                onClick={() => setConfirmReject(true)}
                ref={rejectButton}
                type="button"
              >
                {PLAN_PROPOSAL_COPY.rejectAction}
              </button>
            </div>
          </div>

          {continueOpen ? (
            <ProposalDialog
              labelledBy="continue-title"
              onClose={() => setContinueOpen(false)}
              restoreFocusTo={continueButton}
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
            </ProposalDialog>
          ) : null}
          {confirmReject ? (
            <ProposalDialog
              labelledBy="reject-title"
              onClose={() => setConfirmReject(false)}
              restoreFocusTo={rejectButton}
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
            </ProposalDialog>
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

function ProposalDialog({
  labelledBy,
  onClose,
  restoreFocusTo,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  restoreFocusTo: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restoreOutsideTree = makeOutsideTreeInert(dialog.current);
    const frame = requestAnimationFrame(() => {
      focusableElements(dialog.current)[0]?.focus();
    });
    const invoker = restoreFocusTo.current;
    return () => {
      cancelAnimationFrame(frame);
      restoreOutsideTree();
      requestAnimationFrame(() => invoker?.focus());
    };
  }, [restoreFocusTo]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = focusableElements(dialog.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !dialog.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !dialog.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={styles.dialog}
      onKeyDown={handleKeyDown}
      ref={dialog}
      role="dialog"
    >
      {children}
    </div>
  );
}

function makeOutsideTreeInert(start: HTMLElement | null): () => void {
  const changed: { element: HTMLElement; hadInert: boolean }[] = [];
  let branch: HTMLElement | null = start;
  while (branch?.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
      changed.push({
        element: sibling,
        hadInert: sibling.hasAttribute("inert"),
      });
      sibling.setAttribute("inert", "");
    }
    branch = branch.parentElement;
  }
  return () => {
    for (const { element, hadInert } of changed) {
      if (!hadInert) element.removeAttribute("inert");
    }
  };
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  return Array.from(
    root?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function newIdempotencyKey(): string {
  return `pk_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function subscribeBrowserContext(onStoreChange: () => void) {
  let snapshot = readBrowserContext();
  let timer = 0;

  const scheduleDateChange = () => {
    window.clearTimeout(timer);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    timer = window.setTimeout(
      notifyIfChanged,
      millisecondsUntilDateChange(new Date(), zone),
    );
  };
  const notifyIfChanged = () => {
    const next = readBrowserContext();
    if (next !== snapshot) {
      snapshot = next;
      onStoreChange();
    }
    scheduleDateChange();
  };
  const handleVisibility = () => {
    if (document.visibilityState === "visible") notifyIfChanged();
  };

  window.addEventListener("focus", notifyIfChanged);
  document.addEventListener("visibilitychange", handleVisibility);
  scheduleDateChange();
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("focus", notifyIfChanged);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

export function readBrowserContext(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${zone}|${isoDateInTimezone(new Date(), zone)}`;
}

export function millisecondsUntilDateChange(now: Date, zone: string): number {
  const currentDate = isoDateInTimezone(now, zone);
  let low = now.getTime() + 1;
  let high = now.getTime() + 27 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isoDateInTimezone(new Date(middle), zone) === currentDate) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.max(1, low - now.getTime());
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
