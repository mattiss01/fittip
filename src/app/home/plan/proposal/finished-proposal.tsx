import Link from "next/link";

import styles from "./proposal.module.css";

import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import {
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
 * There is no interactivity here at all, so this stays a Server Component.
 */
export function FinishedProposal({ proposal }: { proposal: PlanProposalView }) {
  const applied = proposal.decision === "applied";
  const staged = stagedItemCount(proposal.items);

  return (
    <section className={styles.review} aria-label={COPY.reviewTitle}>
      <p className={styles.notice} data-state={applied ? "applied" : "idle"}>
        {applied ? COPY.outcomes.applied(staged) : COPY.outcomes.discarded}
      </p>
      <Link className={styles.planLink} href="/home/plan">
        {COPY.finishedPlanLink}
      </Link>
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
                    {item.decision === "staged"
                      ? COPY.stagedBadge
                      : item.decision === "rejected"
                        ? COPY.rejectedBadge
                        : COPY.proposedBadge}
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
    </section>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDay(localDate: string): string {
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  return Number.isFinite(parsed)
    ? DAY_FORMAT.format(new Date(parsed))
    : localDate;
}
