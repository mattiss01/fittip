import Link from "next/link";

import styles from "./proposal.module.css";

import { CoachSpark } from "@/components/home/coach-spark";
import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import {
  isStagedDecision,
  isExampleProposal,
  stagedItemCount,
} from "@/lib/plan/plan-proposal-view";
import type { PlanProposalView } from "@/server/plan-proposal/plan-proposal-records";

const COPY = PLAN_PROPOSAL_COPY;

/**
 * A finished review, as a record of what the owner decided.
 *
 * It is not the merged timeline. Once a proposal has been applied, every staged
 * item is also a session on the plan, so the merged view would show each of them
 * twice — once as the proposal's staged item and once as an already-planned
 * session — and imply the owner had two of them. What is useful after the fact
 * is the proposal's own record: every item, and the choice that was made about
 * it. The plan itself is one link away and is the place to see what it now
 * holds.
 *
 * Folded away since 9 Oct 2026 (owner). It used to stand open under the form
 * until the next proposal, and read as sessions still waiting for a choice:
 * its tags said "Will be added" about things added days before. It is one line
 * now, opened on a tap, and its tags say what happened. A discarded proposal
 * is not shown at all; the page leaves it out before this component is
 * reached.
 *
 * `justFinished` keeps the sentence and the way back to the Plan in view for
 * the moment after a finish, when they are an answer to what the owner just
 * pressed. Later they would be one more old thing on the page.
 *
 * There is no interactivity here beyond the browser's own disclosure, so this
 * stays a Server Component.
 */
export function FinishedProposal({
  proposal,
  justFinished,
}: {
  proposal: PlanProposalView;
  justFinished: boolean;
}) {
  const added = stagedItemCount(proposal.items);
  const rejected = proposal.items.filter(
    (item) => item.decision === "rejected",
  ).length;

  return (
    <section className={styles.review} aria-label={COPY.lastReviewTitle}>
      {justFinished ? (
        <>
          <p className={styles.notice} data-state="applied">
            {COPY.outcomes.applied(added)}
          </p>
          <Link className={styles.planLink} href="/home/plan">
            {COPY.finishedPlanLink}
          </Link>
        </>
      ) : null}

      <details className={styles.lastReview}>
        <summary>
          {COPY.lastReviewSummary(
            formatDay(proposal.decidedAt ?? proposal.createdAt),
            added,
            rejected,
          )}
        </summary>

        {isExampleProposal(proposal.providerCode) ? (
          <p className={styles.exampleNotice} data-state="example">
            <strong>{COPY.exampleBadge}</strong> {COPY.exampleSupport}
          </p>
        ) : null}

        <ol className={styles.days}>
          {proposal.items.map((item) => (
            <li className={styles.day} key={item.ordinal}>
              <p className={styles.dayStamp}>{formatDay(item.localDate)}</p>
              <div className={styles.dayBody}>
                <article
                  className={styles.proposed}
                  data-decision={item.decision}
                >
                  <header className={styles.cardHeader}>
                    <h3>
                      {item.kind === "recovery_day"
                        ? COPY.recoveryDayTitle
                        : (item.title ?? "")}
                    </h3>
                    <span className={styles.badge} data-kind={item.decision}>
                      <CoachSpark size={13} />
                      {isStagedDecision(item.decision)
                        ? COPY.addedBadge
                        : COPY.rejectedBadge}
                    </span>
                  </header>
                  {item.kind === "recovery_day" ? null : (
                    <p className={styles.meta}>
                      {[
                        item.sport,
                        item.expectedDurationMinutes === null
                          ? null
                          : `${item.expectedDurationMinutes} min`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </article>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A local date, or the date part of a timestamp. */
function formatDay(value: string): string {
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? DAY_FORMAT.format(new Date(parsed)) : value;
}
