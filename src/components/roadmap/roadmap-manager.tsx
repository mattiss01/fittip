"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { ReactNode } from "react";

import {
  INITIAL_ROADMAP_ACTION_STATE,
  type RoadmapActionState,
} from "@/app/home/plan/roadmap/action-state";
import {
  acceptRoadmapAction,
  declineRoadmapAction,
  generateRoadmapAction,
} from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { RoadmapEditor } from "@/components/roadmap/roadmap-editor";
// M2-05 established this watchdog for the goal surface and M2-02 reused it for
// memory. The timing rules are not goal-specific and this surface reproduces
// the same defect, so they are reused rather than duplicated. The module name
// is now too narrow; renaming it touches accepted code and belongs elsewhere.
import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  RENDER_GRACE_MS,
  WATCH_INTERVAL_MS,
} from "@/features/goals/mutation-watchdog";

/**
 * The roadmap review surface.
 *
 * The state machine is small and explicit — idle, composing, reviewing,
 * editing, confirming a decline — because the alternative is a screen whose
 * meaning depends on which of five booleans happen to be true. Every state
 * names what is saved and what is not, and none of them claims a roadmap was
 * stored when it was not.
 *
 * The spine itself arrives as already-rendered server nodes. It is static
 * markup over content the server already has, so rendering it here would ship
 * its markup twice: once in the payload and once as the JavaScript to rebuild
 * it.
 */

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no roadmap content, only the fact that the reload
 * happened, so the reloaded page can explain itself.
 */
const RECOVERY_FLAG = "fittip.roadmap.recovered:v1";

const NOTE_MAX = 1000;
const FEEDBACK_MAX = 500;

export type RoadmapManagerProposal = {
  id: string;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  planningNote: string | null;
  regenerationNumber: number;
  assumptions: string[];
  uncertainties: {
    statement: string;
    whyItMatters: string;
    whatToWatch: string;
  }[];
  safetyConsiderations: string[];
  /** Decision 3: named under the spine as well as marked on it. */
  reviewPoints: {
    title: string;
    triggerDate: string | null;
    triggerCondition: string | null;
    question: string;
  }[];
  /** The full content, for the structured editor. */
  content: unknown;
};

export type RoadmapManagerState = {
  today: string;
  headRevision: number;
  defaultEndDate: string;
  hasSafetySignal: boolean;
  regenerationsRemaining: number;
  openMemoryCandidateCount: number;
  goalSummary: { core: number; supporting: number };
  memoryCount: number;
  trainingSummary: { sessionsIncluded: number; windowStartDate: string };
  goalsOutsideHorizon: string[];
  currentVersionNumber: number | null;
  currentTitle: string | null;
  historyCount: number;
  proposal: RoadmapManagerProposal | null;
  /**
   * The declined proposal a regeneration carries, from the server.
   *
   * It is server state rather than something the screen remembers, because the
   * decline that creates it also ends the proposal's life as `proposal`: after
   * a reload there is nothing in the browser that could name the predecessor,
   * and a regeneration without one is refused before any provider call.
   */
  regeneration: {
    previousProposalId: string;
    endDate: string;
    planningNote: string | null;
  } | null;
};

type Screen = "overview" | "compose" | "regenerate" | "editing";

export function RoadmapManager({
  state,
  minDate,
  maxDate,
  currentSpine,
  proposalSpine,
}: {
  state: RoadmapManagerState;
  minDate: string;
  maxDate: string;
  currentSpine: ReactNode;
  proposalSpine: ReactNode;
}) {
  const [generateState, generate, generating] = useActionState(
    generateRoadmapAction,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [decisionState, setDecisionState] = useState<RoadmapActionState>(
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const [deciding, startDecision] = useTransition();
  const [requestedScreen, setScreen] = useState<Screen>("overview");
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  // The editor owns its own transition; the surface only needs to know that one
  // is in flight so the watchdog below covers it.
  const [editorSaving, setEditorSaving] = useState(false);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const formId = useId();

  // One key per compose screen, minted when the screen opens and stable while
  // it is open, so an uncertain retry of the same submission reuses the claim
  // instead of buying a second provider call. Opening compose again mints a new
  // one, and a regeneration is deliberately a new request rather than a retry.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // The last generation result the owner has already moved past. Opening
  // compose records it, so a proposal returned *before* this compose screen
  // opened cannot close the one they just opened.
  const [dismissedGeneration, setDismissedGeneration] = useState(0);

  // Decision 4: a regeneration opens with the same horizon and a prefilled but
  // editable planning note, while the feedback starts empty every round. The
  // note is seeded into state here rather than read through the textarea's
  // value, so an owner who clears the prefill keeps it cleared.
  const openCompose = (next: "compose" | "regenerate") => {
    setIdempotencyKey(newIdempotencyKey());
    setNote(
      next === "regenerate" ? (state.regeneration?.planningNote ?? "") : "",
    );
    setFeedback("");
    setDismissedGeneration(generateState.submission);
    setScreen(next);
  };

  // A generated proposal is the answer to the compose screen, so the review
  // takes its place. Derived rather than stored: the screen the owner should
  // be looking at is a function of the last response, and a second copy of
  // that fact in state is a second thing that can be wrong.
  const screen: Screen =
    (requestedScreen === "compose" || requestedScreen === "regenerate") &&
    generateState.status === "proposal" &&
    generateState.submission !== dismissedGeneration
      ? "overview"
      : requestedScreen;

  const notice =
    decisionState.submission > generateState.submission
      ? decisionState
      : generateState;
  const busy = generating || deciding || editorSaving;
  const proposal = state.proposal;

  const decide = (run: () => Promise<RoadmapActionState>) => {
    startDecision(async () => {
      const result = await run();
      setDecisionState(result);
      if (result.status === "accepted" || result.status === "declined") {
        setScreen("overview");
        setConfirmingDecline(false);
      }
    });
  };

  const lostRender = useLostRenderRecovery(busy);
  const recovered = useRecoveredReload(
    generateState.submission === 0 && decisionState.submission === 0,
  );

  return (
    <div className={styles.manager}>
      {lostRender || recovered ? (
        <p className={styles.notice} data-tone="warning" role="status">
          {lostRender
            ? "This roadmap step did not appear. Reloading to show what is saved."
            : "Your last roadmap step did not appear, so this page was reloaded. What you see below is what is saved."}
        </p>
      ) : null}

      {notice.message ? (
        <p
          className={styles.notice}
          data-state={notice.status}
          data-tone={
            notice.status === "proposal" ||
            notice.status === "accepted" ||
            notice.status === "declined" ||
            notice.status === "edited"
              ? "positive"
              : "warning"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      {/* Decision 7: the flag never blocks generation, and the copy is
          server-owned and identical wherever it appears. */}
      {state.hasSafetySignal ? (
        <p className={styles.safetyNotice}>
          FitTip cannot assess or diagnose symptoms. If symptoms are severe,
          sudden, or getting worse, stop the affected activity and contact a
          qualified health professional.
        </p>
      ) : null}

      {screen === "editing" && proposal ? (
        <RoadmapEditor
          proposalId={proposal.id}
          content={proposal.content}
          onSaving={setEditorSaving}
          onClose={(result) => {
            if (result) setDecisionState(result);
            setScreen("overview");
          }}
        />
      ) : null}

      {screen === "compose" || screen === "regenerate" ? (
        <section className={styles.card} aria-labelledby={`${formId}-compose`}>
          <h2 className={styles.cardHeading} id={`${formId}-compose`}>
            Shape your roadmap
          </h2>

          <form action={generate}>
            <input type="hidden" name="today" value={state.today} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            {screen === "regenerate" && state.regeneration ? (
              <input
                type="hidden"
                name="previousProposalId"
                value={state.regeneration.previousProposalId}
              />
            ) : null}

            <label className={styles.field}>
              <span className={styles.label}>Roadmap ends</span>
              <input
                className={styles.input}
                type="date"
                name="endDate"
                min={minDate}
                max={maxDate}
                required
                readOnly={screen === "regenerate"}
                defaultValue={
                  screen === "regenerate" && state.regeneration
                    ? state.regeneration.endDate
                    : (generateState.draft?.endDate ?? state.defaultEndDate)
                }
              />
              <span className={styles.helper}>
                {screen === "regenerate"
                  ? "A regeneration keeps the same dates. Change them from the overview to start a fresh request."
                  : "Between four and fifty-two weeks from today."}
              </span>
            </label>

            {state.goalsOutsideHorizon.length > 0 ? (
              <p className={styles.helper}>
                Outside these dates: {state.goalsOutsideHorizon.join(", ")}. The
                roadmap builds toward them rather than reaching them.
              </p>
            ) : null}

            <label className={styles.field}>
              <span className={styles.label}>
                Anything the coach should account for? (optional)
              </span>
              <textarea
                className={styles.textarea}
                name="planningNote"
                maxLength={NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <span className={styles.helper}>
                Add commitments or constraints that your saved information does
                not show. Maximum 1,000 characters.
              </span>
              <span
                className={styles.counter}
                data-over={note.length > NOTE_MAX}
              >
                {note.length} / {NOTE_MAX}
              </span>
            </label>

            {screen === "regenerate" ? (
              <label className={styles.field}>
                <span className={styles.label}>
                  What should the coach change?
                </span>
                <textarea
                  className={styles.textarea}
                  name="regenerationFeedback"
                  maxLength={FEEDBACK_MAX}
                  required
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />
                <span
                  className={styles.counter}
                  data-over={feedback.length > FEEDBACK_MAX}
                >
                  {feedback.length} / {FEEDBACK_MAX}
                </span>
                <span className={styles.helper}>
                  The previous proposal will be shared with the coach. Nothing
                  changes until you accept.
                </span>
              </label>
            ) : null}

            {/* Collapsed by default so the screen stays short at 390px, and it
                names the exact material rather than an invented summary. */}
            <details className={styles.disclosure}>
              <summary className={styles.disclosureSummary}>
                What the coach will use —{" "}
                {state.goalSummary.core + state.goalSummary.supporting} goals ·{" "}
                {state.memoryCount} memory items ·{" "}
                {state.trainingSummary.sessionsIncluded} recent sessions
              </summary>
              <div className={styles.disclosureBody}>
                <p className={styles.helper}>
                  Only active, accepted information and the bounded training
                  window are included.
                </p>
                <dl className={styles.sourceGroup}>
                  <dt>Goals</dt>
                  <dd>
                    {state.goalSummary.core + state.goalSummary.supporting === 0
                      ? "None included"
                      : `${state.goalSummary.core} core, ${state.goalSummary.supporting} supporting, with their target dates.`}
                  </dd>
                  <dt>Memory</dt>
                  <dd>
                    {state.memoryCount === 0
                      ? "None included"
                      : `${state.memoryCount} accepted, active items.`}
                  </dd>
                  <dt>Recent training</dt>
                  <dd>
                    {state.trainingSummary.sessionsIncluded === 0
                      ? "None included"
                      : `${state.trainingSummary.sessionsIncluded} sessions since ${state.trainingSummary.windowStartDate}, with their completion values, flags, and shortened notes.`}
                  </dd>
                  <dt>Current plan commitments</dt>
                  <dd>Planned and locked sessions inside these dates.</dd>
                </dl>
              </div>
            </details>

            <div className={styles.actions}>
              <button
                className={styles.primaryAction}
                type="submit"
                disabled={busy}
              >
                {screen === "regenerate"
                  ? "Generate another proposal"
                  : "Generate roadmap proposal"}
              </button>
              <p className={styles.helper}>
                Nothing changes until you accept a proposal.
              </p>
              <button
                className={styles.quietAction}
                type="button"
                onClick={() => setScreen("overview")}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>

          {generating ? (
            <p className={styles.pending} role="status">
              Building your roadmap proposal... Your current roadmap stays
              unchanged.
            </p>
          ) : null}
        </section>
      ) : null}

      {screen === "overview" && proposal ? (
        <section className={styles.review} aria-label="Proposed roadmap">
          <div>
            <p className={styles.reviewHeader}>Direction, not a promise.</p>
            <h2 className={styles.proposalTitle}>{proposal.title}</h2>
            <p className={styles.horizon}>
              {proposal.startDate} → {proposal.endDate}
            </p>
            <p className={styles.proposalSummary}>{proposal.summary}</p>
          </div>

          {proposalSpine}

          {proposal.assumptions.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>What this assumes</h3>
              <ul className={styles.plainList}>
                {proposal.assumptions.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposal.uncertainties.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                What could change the direction
              </h3>
              {proposal.uncertainties.map((entry) => (
                <div key={entry.statement} className={styles.uncertainty}>
                  <p>{entry.statement}</p>
                  <p className={styles.uncertaintyMeta}>
                    Why it matters: {entry.whyItMatters}
                  </p>
                  <p className={styles.uncertaintyMeta}>
                    Watch for: {entry.whatToWatch}
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          {/* Decision 3: the checkpoints are marked on the spine where they
              fall, and named again here so "when to reassess" is answerable
              without reading the whole spine. Nothing here replans, notifies,
              or changes anything. */}
          {proposal.reviewPoints.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>When to reassess</h3>
              {proposal.reviewPoints.map((point) => (
                <div key={point.title} className={styles.uncertainty}>
                  <p>
                    {point.triggerDate
                      ? `Review on ${point.triggerDate}`
                      : `Review when ${point.triggerCondition}`}
                  </p>
                  <p className={styles.uncertaintyMeta}>{point.question}</p>
                </div>
              ))}
            </section>
          ) : null}

          {proposal.safetyConsiderations.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>Held back for now</h3>
              <ul className={styles.plainList}>
                {proposal.safetyConsiderations.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* No action is preselected. */}
          <div className={styles.dock}>
            <p className={styles.dockLabel}>Your decision</p>
            <button
              className={styles.primaryAction}
              type="button"
              disabled={busy}
              onClick={() =>
                decide(() =>
                  acceptRoadmapAction(proposal.id, state.headRevision),
                )
              }
            >
              Accept roadmap
            </button>
            <button
              className={styles.secondaryAction}
              type="button"
              disabled={busy}
              onClick={() => setScreen("editing")}
            >
              Edit proposal
            </button>
            <button
              className={styles.secondaryAction}
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDecline(true)}
            >
              Decline proposal
            </button>
          </div>
        </section>
      ) : null}

      {screen === "overview" && !proposal ? (
        <section className={styles.card}>
          <h2 className={styles.cardHeading}>
            {state.currentTitle ?? "No roadmap yet"}
          </h2>
          {state.currentTitle ? (
            currentSpine
          ) : (
            <p className={styles.emptyState}>
              You have no roadmap. FitTip can propose one from your goals, the
              memory you have accepted, and your recent training. You review it
              before anything becomes current.
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.primaryAction}
              type="button"
              disabled={busy}
              onClick={() => openCompose("compose")}
            >
              {state.currentTitle ? "Propose a new roadmap" : "Create roadmap"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Decision 4b: separate from the roadmap dock, visually and
          transactionally. Accepting or declining the roadmap decides nothing
          here, and leaving the screen keeps candidates proposed. */}
      {state.openMemoryCandidateCount > 0 ? (
        <section className={styles.memoryPanel}>
          <h2 className={styles.sectionHeading}>Possible memory updates</h2>
          <p className={styles.emptyState}>
            {state.openMemoryCandidateCount} item
            {state.openMemoryCandidateCount === 1 ? "" : "s"} from your planning
            note are waiting for you. They are not used for coaching until you
            accept them.
          </p>
          <p>
            <Link className={styles.quietAction} href="/home/you/memory">
              Memory updates still need your review
            </Link>
          </p>
        </section>
      ) : null}

      {state.historyCount > 0 ? (
        <section className={styles.card}>
          <h2 className={styles.sectionHeading}>Superseded roadmaps</h2>
          <p className={styles.emptyState}>
            {state.historyCount} earlier version
            {state.historyCount === 1 ? "" : "s"} stay readable and unchanged.
          </p>
        </section>
      ) : null}

      {confirmingDecline && proposal ? (
        <div className={styles.dialog} role="dialog" aria-modal="true">
          <p className={styles.dialogText}>
            Decline this proposal? It will stay in your roadmap history and will
            not become current.
          </p>
          <div className={styles.actions}>
            <button
              className={styles.primaryAction}
              type="button"
              disabled={busy}
              onClick={() => decide(() => declineRoadmapAction(proposal.id))}
            >
              Decline proposal
            </button>
            <button
              className={styles.quietAction}
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDecline(false)}
            >
              Keep reviewing
            </button>
          </div>
        </div>
      ) : null}

      {/* Offered from the declined predecessor the server read, not from the
          decline this browser happens to remember. */}
      {screen === "overview" && !proposal && state.regeneration ? (
        <section className={styles.card}>
          {state.regenerationsRemaining > 0 ? (
            <>
              <p className={styles.emptyState}>
                {state.regenerationsRemaining} regeneration
                {state.regenerationsRemaining === 1 ? "" : "s"} left for these
                dates.
              </p>
              <button
                className={styles.secondaryAction}
                type="button"
                onClick={() => openCompose("regenerate")}
              >
                Regenerate proposal
              </button>
            </>
          ) : (
            <p className={styles.emptyState}>
              You have used all three regenerations for these dates. Edit the
              proposal directly, or change the dates to start a fresh request.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Opaque, bounded, and matched to the server's accepted key shape. */
function newIdempotencyKey(): string {
  return `rk_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * M2-05's lost-render defect, on this surface.
 *
 * Every roadmap step submits through a transition, so the typed result and the
 * revalidated tree arrive together — and that transition intermittently never
 * commits. Measured here: three of six local compose runs left the screen on
 * "Building your roadmap proposal…" for ever while the server had already
 * answered 200 with the complete proposal, and a reload showed it every time.
 *
 * Only the "a reply arrived and never rendered" half of `watchGoalMutation` is
 * used. Its ten-second confirmation budget belongs to a form save; a roadmap
 * generation is one provider call and has no honest fixed deadline, so a
 * silent request is left to keep waiting behind the pending copy rather than
 * being declared unconfirmed while it is still legitimately running.
 *
 * What a resource-timing entry proves is only that a response arrived, never
 * what it said: this action answers 200 for a conflict, a validation failure
 * and an expired session too. So the notice claims nothing about saving, and
 * the reload is what shows the owner where their roadmap actually stands.
 */
function useLostRenderRecovery(pending: boolean): boolean {
  const [lostFor, setLostFor] = useState<string | null>(null);
  const respondedAt = useRef<number | null>(null);
  const consumedAt = useRef<number | null>(null);
  const key = String(pending);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (seen === null) return;
      if (respondedAt.current === null || seen > respondedAt.current) {
        respondedAt.current = seen;
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    // A new step supersedes any earlier recovery, so the explanation is
    // consumed here rather than in the render that would have shown it.
    markRoadmapRecovered(false);
    let reload = 0;
    const interval = window.setInterval(() => {
      const arrived = respondedAt.current;
      const unaccountedFor =
        arrived !== null &&
        (consumedAt.current === null || arrived > consumedAt.current);
      if (!unaccountedFor || performance.now() - arrived < RENDER_GRACE_MS) {
        return;
      }
      window.clearInterval(interval);
      setLostFor(key);
      markRoadmapRecovered(true);
      reload = window.setTimeout(
        () => window.location.reload(),
        RECOVERY_NOTICE_MS,
      );
    }, WATCH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      // Cleanup runs when this step settles or the surface unmounts, so a
      // queued reload is stale by then: the result is already on screen.
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [key, pending]);

  return lostFor === key && pending;
}

/**
 * The recovery reload replaces the surface, so the message the step produced
 * is gone. Saying nothing would leave the reload looking like an unexplained
 * flash, so the reason is carried across it until the next step.
 */
function useRecoveredReload(untouched: boolean): boolean {
  // The server has no session storage and reports "not recovered", and the
  // client agrees on the first render, so hydration cannot mismatch.
  const recovered = useSyncExternalStore(
    subscribeNothing,
    readRoadmapRecovered,
    () => false,
  );
  return recovered && untouched;
}

function subscribeNothing() {
  return () => {};
}

function readRoadmapRecovered(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch {
    // Session storage throws in private browsing and when it is disabled.
    return false;
  }
}

function markRoadmapRecovered(recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}
