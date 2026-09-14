import Link from "next/link";

import { RoadmapDetail } from "./roadmap-detail";
import { RoadmapProposalRecord } from "./roadmap-proposal-record";

import homeStyles from "@/app/home/home.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  type RoadmapScreenState,
} from "@/server/roadmap/roadmap-records";

/**
 * The whole read-only roadmap surface, rendered from one already-authorized
 * snapshot.
 *
 * Every component below it is a Server Component too, so nothing on this
 * screen crosses the server/client boundary and none of the roadmap content —
 * which includes whatever the owner wrote in a planning note — is serialized
 * into a client payload. That is also why the page is free to hand the whole
 * `RoadmapScreenState` down: the parts the markup does not use never leave the
 * server.
 */
export function RoadmapScreen({ state }: { state: RoadmapScreenState }) {
  const goalTitles = Object.fromEntries(
    state.goals.map((goal) => [goal.id, goal.title]),
  );
  const superseded = state.history.slice(1);

  return (
    <div className={styles.screen}>
      {/* Server-owned and never model-authored. It states the limit of what
          FitTip can do with a reported symptom; it does not assess one. */}
      {state.hasSafetySignal ? (
        <p className={styles.safetyNotice} data-roadmap-safety-notice>
          {ROADMAP_COPY.safetyNotice}
        </p>
      ) : null}

      <section className={styles.card} data-roadmap-current>
        {state.current === null ? (
          <>
            <h2 className={styles.cardHeading}>No roadmap yet.</h2>
            <p className={styles.emptyState}>
              A roadmap is months of direction rather than a week of sessions.
              Once you have one it stays here, with every version before it.
            </p>
          </>
        ) : (
          <RoadmapDetail version={state.current} goalTitles={goalTitles} />
        )}
      </section>

      {superseded.length > 0 ? (
        <section className={styles.card} data-roadmap-superseded>
          <h2 className={styles.sectionHeading}>Superseded roadmaps</h2>
          <p className={styles.emptyState}>
            Earlier versions stay readable and unchanged.
          </p>
          <ul className={styles.historyList}>
            {superseded.map((version) => (
              <li
                className={styles.historyItem}
                key={version.id}
                data-roadmap-superseded-version={version.versionNumber}
              >
                <p className={styles.state} data-state="accepted">
                  Version {version.versionNumber}
                </p>
                <h3 className={styles.recordTitle}>{version.content.title}</h3>
                <p className={styles.horizon}>
                  {version.content.startDate} → {version.content.endDate}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.proposalHistory.length > 0 ? (
        <section className={styles.card} data-roadmap-proposals>
          <h2 className={styles.sectionHeading}>Proposals</h2>
          <p className={styles.emptyState}>
            What was proposed, and what became of it.
          </p>
          <ul className={styles.historyList}>
            {state.proposalHistory.map((proposal) => (
              <RoadmapProposalRecord key={proposal.id} proposal={proposal} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Separate from the roadmap, as M3-02 decision 4b requires: a memory
          candidate is decided on the memory surface that owns it, and nothing
          on this screen decides one either way. */}
      {state.openMemoryCandidateCount > 0 ? (
        <section className={styles.memoryPanel} data-roadmap-memory>
          <h2 className={styles.sectionHeading}>
            {ROADMAP_COPY.memoryPanelTitle}
          </h2>
          <p className={styles.emptyState}>
            {state.openMemoryCandidateCount} item
            {state.openMemoryCandidateCount === 1 ? "" : "s"} from a planning
            note are waiting for you. They are not used for coaching until you
            accept them.
          </p>
          <Link className={homeStyles.secondaryAction} href="/home/you/memory">
            {ROADMAP_COPY.memoryReviewLink}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
