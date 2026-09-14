import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  ROADMAP_COPY,
  type RoadmapProposalOrigin,
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
 */

const STATE_LABELS = {
  open: "Awaiting your decision",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
} as const;

const ORIGIN_LABELS: Record<RoadmapProposalOrigin, string> = {
  ai_initial: "From the coach",
  ai_regeneration: "Regenerated",
  owner_edit: "Your edit",
};

export function RoadmapProposalRecord({
  proposal,
}: {
  proposal: RoadmapProposalView;
}) {
  const state = proposal.decision ?? "open";

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
        {STATE_LABELS[state]}
      </p>
      <h3 className={styles.recordTitle}>{proposal.content.title}</h3>
      <p className={styles.horizon}>
        {ORIGIN_LABELS[proposal.origin]} · {startDate} → {endDate}
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
    </li>
  );
}
