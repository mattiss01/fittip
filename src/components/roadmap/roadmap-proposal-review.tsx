import { RoadmapBody } from "./roadmap-body";
import { RoadmapDecisionDock } from "./roadmap-decision-dock";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  isExampleAuthored,
  ROADMAP_COPY,
  type RoadmapProposalView,
} from "@/server/roadmap/roadmap-records";

/**
 * The proposal that is waiting, shown in full and with the three controls.
 *
 * In full, rather than as the compact record it also appears as further down:
 * the owner is being asked to make this their roadmap, and a decision taken
 * from a title and a summary is a decision taken from less than what would be
 * accepted.
 *
 * It sits above the current roadmap because it is the only thing on this screen
 * asking for something. The current roadmap is unaffected until the moment the
 * owner accepts, which the dock's own copy says.
 *
 * A Server Component that renders a client dock. Everything readable — the
 * spine, the assumptions, the example label — is server-rendered, so the only
 * roadmap content serialized into the browser is the body the editor needs.
 */
export function RoadmapProposalReview({
  proposal,
  expectedHeadRevision,
  goalTitles,
}: {
  proposal: RoadmapProposalView;
  expectedHeadRevision: number;
  goalTitles: Record<string, string>;
}) {
  // A generation request is what carries the horizon the owner asked for. If
  // that row is unreadable the view reports empty strings rather than a wrong
  // date, so the roadmap's own dates stand in.
  const startDate = proposal.startDate || proposal.content.startDate;
  const endDate = proposal.endDate || proposal.content.endDate;

  return (
    <section className={styles.card} data-roadmap-open-proposal={proposal.id}>
      <p className={styles.state} data-state="open">
        {ROADMAP_COPY.proposalStateLabels.open}
      </p>
      <h2 className={styles.cardHeading}>{ROADMAP_COPY.openProposalHeading}</h2>
      <p className={styles.emptyState}>{ROADMAP_COPY.openProposalSupport}</p>

      {isExampleAuthored(proposal.providerCode) ? (
        <p className={styles.recordNote} data-roadmap-example-notice>
          {ROADMAP_COPY.exampleNotice}
        </p>
      ) : null}

      <article>
        <RoadmapBody
          content={proposal.content}
          meta={`${ROADMAP_COPY.proposalOriginLabels[proposal.origin]} · ${startDate} → ${endDate}`}
          providerCode={proposal.providerCode}
          goalTitles={goalTitles}
        />
      </article>

      {/* Keyed by the proposal, because the dock's state is about one proposal
          and nothing in it should outlive the proposal it described. An edit
          replaces the open proposal at this exact position, and without the key
          a refusal about the proposal that was here — a stale conflict on
          accept, say — would render under the new one. The sentence a landed
          write earns is not at risk: it lives in `roadmap-outcome.tsx`, which
          `RoadmapScreen` renders above all of this and no remount here can
          touch. */}
      <RoadmapDecisionDock
        key={proposal.id}
        proposalId={proposal.id}
        content={proposal.content}
        expectedHeadRevision={expectedHeadRevision}
        goalTitles={goalTitles}
      />
    </section>
  );
}
