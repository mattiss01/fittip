import Link from "next/link";

import { RoadmapComposer } from "./roadmap-composer";
import { RoadmapDetail } from "./roadmap-detail";
import { RoadmapOutcomeNotice } from "./roadmap-outcome";
import { RoadmapNew } from "./roadmap-new";
import { RoadmapReviewDue } from "./roadmap-review-due";
import { RoadmapProposalReview } from "./roadmap-proposal-review";
import { RoadmapWriter } from "./roadmap-writer";

import homeStyles from "@/app/home/home.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { lockedPhaseCount } from "@/lib/roadmap/roadmap-locked-phases";
import {
  addDays,
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
/** The headings that name the sheet a due review opens. */
const REVIEW_SHEET_TITLE_IDS = {
  menu: "roadmap-review-sheet-title",
  change: "roadmap-review-change-title",
  fresh: "roadmap-review-sheet-title",
  write: "roadmap-review-sheet-title",
  rewrite: "roadmap-review-sheet-title",
};

/** The sheet that edits the roadmap in force: it opens on nothing else. */
const REWRITE_SHEET_TITLE_IDS = {
  menu: "roadmap-rewrite-title",
  change: "roadmap-rewrite-title",
  fresh: "roadmap-rewrite-title",
  write: "roadmap-rewrite-title",
  rewrite: "roadmap-rewrite-title",
};

/** The writer's sheet while there is no roadmap: it opens on nothing else. */
const FIRST_WRITE_SHEET_TITLE_IDS = {
  menu: "roadmap-first-write-title",
  change: "roadmap-first-write-title",
  fresh: "roadmap-first-write-title",
  write: "roadmap-first-write-title",
  rewrite: "roadmap-first-write-title",
};

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
          today={state.today}
          regenerationsRemaining={state.regenerationsRemaining}
        />
      ) : state.current === null ? (
        <>
          <RoadmapCompose state={state} />
          {/* The case writing by hand exists for (owner, 2 Oct 2026): no
              roadmap, and perhaps no coach to ask for one. */}
          <div className={styles.writeOffer}>
            <RoadmapNew
              opensOn="write"
              titleIds={FIRST_WRITE_SHEET_TITLE_IDS}
              change={null}
              fresh={null}
              write={
                <RoadmapWrite
                  state={state}
                  headingId={FIRST_WRITE_SHEET_TITLE_IDS.write}
                />
              }
            />
          </div>
        </>
      ) : null}

      {/* A phase has ended, or the roadmap has (ADR-027). Above the roadmap,
          under a proposal that is waiting: deciding that comes first, and a
          new roadmap would end the review with the roadmap it is of. */}
      {state.current !== null && state.reviewDue !== null ? (
        <RoadmapReviewDue
          versionId={state.current.id}
          phaseIndex={state.reviewDue.phaseIndex}
          roadmapEnded={state.reviewDue.roadmapEnded}
        >
          {/* What a review may lead to (ADR-028). Not while a proposal is
              waiting: decide that first. */}
          {state.openProposal === null ? (
            <RoadmapNew
              opensOn="change"
              titleIds={REVIEW_SHEET_TITLE_IDS}
              change={
                <RoadmapChangeCompose
                  state={state}
                  headingId={REVIEW_SHEET_TITLE_IDS.change}
                />
              }
              fresh={null}
            />
          ) : null}
        </RoadmapReviewDue>
      ) : null}

      {/* With no roadmap there is nothing to show here: the coach's form
          above is the page (owner, 14 Oct 2026). */}
      {state.current === null ? null : (
        <section className={styles.card} data-roadmap-current>
          <RoadmapDetail
            version={state.current}
            reached={state.reached}
            review={{
              duePhaseIndex: state.reviewDue?.phaseIndex ?? null,
              reviewedThrough: state.reviewedThrough,
            }}
            goalTitles={goalTitles}
          />
          {/* Editing it by hand (ADR-030). Not while a proposal waits, which
              was made under this roadmap, and not once it has ended. */}
          {state.openProposal === null &&
          state.current.content.endDate >= state.today ? (
            <div className={styles.writeOffer}>
              <RoadmapNew
                opensOn="rewrite"
                titleIds={REWRITE_SHEET_TITLE_IDS}
                change={null}
                fresh={null}
                rewrite={
                  <RoadmapWriter
                    today={state.today}
                    goals={state.goals.map((goal) => ({
                      id: goal.id,
                      title: goal.title,
                    }))}
                    expectedHeadRevision={state.head.revision}
                    replaces
                    headingId={REWRITE_SHEET_TITLE_IDS.rewrite}
                    inForce={{
                      content: state.current.content,
                      lockedPhases: lockedPhaseCount(
                        state.current.content.phases,
                        state.today,
                      ),
                    }}
                  />
                }
              />
            </div>
          ) : null}
        </section>
      )}

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
 * A roadmap written by hand (ADR-029), against the head this page read and
 * the owner's active goals.
 */
export function RoadmapWrite({
  state,
  headingId,
}: {
  state: RoadmapScreenState;
  headingId: string;
}) {
  return (
    <RoadmapWriter
      today={state.today}
      goals={state.goals.map((goal) => ({ id: goal.id, title: goal.title }))}
      expectedHeadRevision={state.head.revision}
      replaces={state.current !== null}
      headingId={headingId}
    />
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
/**
 * The form that asks for the roadmap in force to be changed (ADR-028).
 *
 * Both dates are the owner's to pick. They open on today and on the day the
 * roadmap ends, where that is a length a roadmap may have; a roadmap that is
 * nearly over, or already is, opens on the usual default end.
 */
export function RoadmapChangeCompose({
  state,
  headingId,
}: {
  state: RoadmapScreenState;
  headingId: string;
}) {
  const roadmapEnd = state.current?.content.endDate ?? "";
  const usable =
    roadmapEnd >= addDays(state.today, ROADMAP_MIN_DAYS) &&
    roadmapEnd <= addDays(state.today, ROADMAP_MAX_DAYS);

  return (
    <RoadmapComposer
      mode="change"
      startDate={state.today}
      endDate={usable ? roadmapEnd : state.defaultEndDate}
      today={state.today}
      minDays={ROADMAP_MIN_DAYS}
      maxDays={ROADMAP_MAX_DAYS}
      regenerationsRemaining={state.regenerationsRemaining}
      headingId={headingId}
    />
  );
}

export function RoadmapCompose({
  state,
  headingId,
}: {
  state: RoadmapScreenState;
  headingId?: string;
}) {
  // Always a first request (owner, 14 Oct 2026). After a decline the
  // proposal is gone from the page, so there is nothing left to say what
  // should change about; asking again with a note is offered on the
  // proposal itself, where it can be read.
  return (
    <RoadmapComposer
      mode="initial"
      endDate={state.defaultEndDate}
      startDate={state.today}
      today={state.today}
      minDays={ROADMAP_MIN_DAYS}
      maxDays={ROADMAP_MAX_DAYS}
      regenerationsRemaining={state.regenerationsRemaining}
      {...(headingId === undefined ? {} : { headingId })}
    />
  );
}
