import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import type {
  RoadmapProposalOrigin,
  RoadmapProposalView,
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
        <p className={styles.recordBody}>{proposal.content.summary}</p>
      ) : null}
      {state === "expired" ? (
        <p className={styles.recordBody}>
          This proposal can no longer be accepted. It stays here, unchanged,
          with everything it was built on.
        </p>
      ) : null}
    </li>
  );
}
