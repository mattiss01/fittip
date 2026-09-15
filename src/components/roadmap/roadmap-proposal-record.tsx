import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  type RoadmapProposalView,
} from "@/server/roadmap/roadmap-records";

/**
 * A proposal as a record, never as something to act on.
 *
 * Every proposal the owner has ever had is permanent, and the state it ended
 * in is the point of showing it: a proposal M3-11 marked `expired` is not
 * missing and not still waiting, and a screen that showed neither would leave
 * the owner to guess which. Accepting, declining and editing are M3-15F, so
 * this file carries no button, no form, and no link that pretends to offer
 * one.
 *
 * Nor does it say one is coming. A state that cannot be acted on says so
 * outright, because "Awaiting your decision" over a screen with no way to
 * decide is the same inert affordance as a greyed-out button — it just
 * costs the owner a search of the interface to discover it.
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
      <h3 className={styles.recordTitle}>{proposal.content.title}</h3>
      <p className={styles.horizon}>
        {ROADMAP_COPY.proposalOriginLabels[proposal.origin]} · {startDate} →{" "}
        {endDate}
      </p>
      {state === "open" ? (
        <>
          <p className={styles.recordBody}>{proposal.content.summary}</p>
          {/* Without this the label above is an inert affordance in copy: it
              says a decision is awaited while the application offers no way to
              make one. */}
          <p className={styles.recordNote}>
            {ROADMAP_COPY.proposalDecisionUnavailable}
          </p>
        </>
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
