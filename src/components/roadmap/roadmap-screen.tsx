import Link from "next/link";

import { RoadmapComposer } from "./roadmap-composer";
import { RoadmapDetail } from "./roadmap-detail";
import { RoadmapOutcomeNotice } from "./roadmap-outcome";
import { RoadmapProposalReview } from "./roadmap-proposal-review";

import homeStyles from "@/app/home/home.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  ROADMAP_MAX_DAYS,
  ROADMAP_MIN_DAYS,
  type RoadmapScreenState,
} from "@/server/roadmap/roadmap-records";

/**
 * The whole roadmap surface, rendered from one already-authorized snapshot.
 *
 * ## What is on screen, and in what order
 *
 * The thing that is asking for something comes first. A proposal awaiting a
 * decision is the only such thing, so when one exists it sits above the current
 * roadmap, in full, with its controls. When none does, the page starts with
 * the roadmap (owner, 13 Oct 2026), and the compose form is behind the page's
 * "New roadmap" button. Only an owner with no roadmap yet gets the form on the
 * page itself, where the roadmap would be.
 *
 * Earlier versions and decided proposals are not listed (owner, the same day).
 * They are permanent records and stay stored; this page shows the roadmap in
 * force and what is waiting.
 *
 * ## Why the compose form is absent while a proposal is open
 *
 * Not because the control is unavailable — nothing on this surface is hidden by
 * environment, and everything shown works. It is because a second concurrent
 * request would produce a second proposal for the same horizon and the
 * repository would have to pick one of them to call open. The ticket's own
 * order is decide, then ask again; the database enforces the second half of it
 * by refusing a regeneration whose predecessor has not been declined.
 *
 * ## The client boundary
 *
 * Four components cross it here: the outcome notice, the compose form, the
 * decision dock, and the editor inside the dock. The page adds a fifth, the
 * "New roadmap" button and its sheet. Everything else here is a Server
 * Component, so the only roadmap content serialized into the browser is the
 * open proposal's body, which the editor needs in order to edit it. An owner's
 * planning note is not part of that body and never leaves the server, and the
 * outcome notice carries no content at all — only the sentence a write earned.
 */
export function RoadmapScreen({ state }: { state: RoadmapScreenState }) {
  const goalTitles = Object.fromEntries(
    state.goals.map((goal) => [goal.id, goal.title]),
  );

  return (
    <div className={styles.screen}>
      {/* What the last write did, above everything it changed. It is a client
          island of its own because every control on this surface is removed by
          the write it performs; see `roadmap-outcome.tsx`. */}
      <RoadmapOutcomeNotice />

      {/* Server-owned and never model-authored. It states the limit of what
          FitTip can do with a reported symptom; it does not assess one. */}
      {state.hasSafetySignal ? (
        <p className={styles.safetyNotice} data-roadmap-safety-notice>
          {ROADMAP_COPY.safetyNotice}
        </p>
      ) : null}

      {state.openProposal !== null ? (
        <RoadmapProposalReview
          proposal={state.openProposal}
          expectedHeadRevision={state.head.revision}
          goalTitles={goalTitles}
        />
      ) : state.current === null ? (
        <RoadmapCompose state={state} />
      ) : null}

      <section className={styles.card} data-roadmap-current>
        {state.current === null ? (
          <>
            <h2 className={styles.cardHeading}>
              {ROADMAP_COPY.emptyRoadmapTitle}
            </h2>
            <p className={styles.emptyState}>{ROADMAP_COPY.emptyRoadmapBody}</p>
          </>
        ) : (
          <RoadmapDetail
            version={state.current}
            reached={state.reached}
            goalTitles={goalTitles}
          />
        )}
      </section>

      {/* Separate from the roadmap, as M3-02 decision 4b requires: a memory
          candidate is decided on the memory surface that owns it, and nothing
          on this screen decides one either way. */}
      {state.openMemoryCandidateCount > 0 ? (
        <section className={styles.memoryPanel} data-roadmap-memory>
          <h2 className={styles.sectionHeading}>
            {ROADMAP_COPY.memoryPanelTitle}
          </h2>
          <p className={styles.emptyState}>
            {ROADMAP_COPY.memoryCandidatesWaiting(
              state.openMemoryCandidateCount,
            )}
          </p>
          <Link className={homeStyles.secondaryAction} href="/home/you/memory">
            {ROADMAP_COPY.memoryReviewLink}
          </Link>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The compose form for the state the records are in, and the regeneration
 * ceiling where it has been reached. Rendered on the page while there is no
 * roadmap, and in the "New roadmap" sheet once there is one.
 *
 * After a decline it is a regeneration carrying the declined proposal,
 * otherwise a first request.
 */
export function RoadmapCompose({
  state,
  headingId,
}: {
  state: RoadmapScreenState;
  headingId?: string;
}) {
  const predecessor = state.declinedPredecessor;
  const canRegenerate =
    predecessor !== null && state.regenerationsRemaining > 0;

  return (
    <>
      <RoadmapComposer
        mode={canRegenerate ? "regeneration" : "initial"}
        endDate={
          canRegenerate && predecessor
            ? predecessor.endDate || predecessor.content.endDate
            : state.defaultEndDate
        }
        startDate={
          canRegenerate && predecessor
            ? predecessor.startDate || predecessor.content.startDate
            : state.today
        }
        today={state.today}
        minDays={ROADMAP_MIN_DAYS}
        maxDays={ROADMAP_MAX_DAYS}
        {...(canRegenerate && predecessor
          ? { previousProposalId: predecessor.id }
          : {})}
        regenerationsRemaining={state.regenerationsRemaining}
        {...(headingId === undefined ? {} : { headingId })}
      />

      {/* The ceiling is a fact about these dates, not a control. Saying so
          where the regeneration form would have been is the difference between
          "there is nothing here" and "you have used all three". */}
      {predecessor !== null && state.regenerationsRemaining === 0 ? (
        <p className={styles.notice} data-roadmap-notice="cap-reached">
          {ROADMAP_COPY.regenerationCapReached}
        </p>
      ) : null}
    </>
  );
}
