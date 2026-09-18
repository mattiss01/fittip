import { ExampleTag } from "./roadmap-body";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  type RoadmapProposalView,
} from "@/server/roadmap/roadmap-records";

/**
 * A proposal as a record.
 *
 * Every proposal the owner has ever had is permanent, and the state it ended in
 * is the point of showing it: a proposal M3-11 marked `expired` is not missing
 * and not still waiting, and a screen that showed neither would leave the owner
 * to guess which.
 *
 * It is a record here and only here. The open proposal is decided on above, in
 * full, by `RoadmapProposalReview`; this entry is its line in the history, so
 * it repeats the state and the summary and offers no second set of controls.
 * Two accept buttons for one proposal would be two answers to the question of
 * where a decision is made.
 *
 * A missing decision alone does not make a proposal open. An owner edit
 * supersedes its source without deciding it, so the repository's `open` is the
 * only authority on which undecided proposal awaits a decision; every other
 * undecided one is shown as superseded.
 */

export function RoadmapProposalRecord({
  proposal,
  openProposalId,
}: {
  proposal: RoadmapProposalView;
  /** `RoadmapScreenState.openProposal`'s id, or null when nothing is open. */
  openProposalId: string | null;
}) {
  const state =
    proposal.decision ??
    (proposal.id === openProposalId ? "open" : "superseded");

  // A generation request is what carries the horizon the owner asked for. If
  // that row is unreadable the view reports empty strings rather than a wrong
  // date, so the roadmap's own dates stand in instead of rendering an arrow
  // between two blanks.
  const startDate = proposal.startDate || proposal.content.startDate;
  const endDate = proposal.endDate || proposal.content.endDate;

  return (
    <li
      className={styles.historyItem}
      data-roadmap-proposal={proposal.id}
      data-roadmap-proposal-state={state}
    >
      <p className={styles.state} data-state={state}>
        {ROADMAP_COPY.proposalStateLabels[state]}
      </p>
      <ExampleTag providerCode={proposal.providerCode} />
      <h3 className={styles.recordTitle}>{proposal.content.title}</h3>
      <p className={styles.horizon}>
        {ROADMAP_COPY.proposalOriginLabels[proposal.origin]} · {startDate} →{" "}
        {endDate}
      </p>
      {state === "open" ? (
        <p className={styles.recordBody}>{proposal.content.summary}</p>
      ) : null}
      {state === "expired" ? (
        <p className={styles.recordNote}>{ROADMAP_COPY.proposalExpired}</p>
      ) : null}
      {state === "superseded" ? (
        <p className={styles.recordNote}>{ROADMAP_COPY.proposalSuperseded}</p>
      ) : null}
    </li>
  );
}
