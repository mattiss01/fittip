/**
 * The plan-proposal shapes a Client Component may hold.
 *
 * They live here rather than beside the rest of the domain in
 * `@/server/plan-proposal/plan-proposal-records` because that module imports
 * `server-only` and sits under `@/server/**`, both of which the client import
 * boundary in `src/architecture/server-boundary.test.ts` refuses — a type-only
 * import included, because that invariant reads the file rather than the
 * compiled graph, and reading the file is what makes it enforceable.
 *
 * Nothing here has behaviour. The server module imports these and adds the
 * shapes that carry proposal content, which no Client Component needs.
 */

import type { RoadmapPlanStaleReason } from "@/lib/roadmap/roadmap-stale-reasons";

/**
 * What the owner has said about one proposed item.
 *
 * `staged_beside` exists only for an item that would replace a planned
 * session (ADR-024): add it and keep the session. On such an item `staged`
 * means replace; on a cancel item it means cancel (ADR-033); on any other it
 * means add, as it always did.
 */
export type PlanProposalItemDecision =
  | "proposed"
  | "staged"
  | "staged_beside"
  | "rejected";

export const PLAN_PROPOSAL_ITEM_DECISIONS: readonly PlanProposalItemDecision[] =
  ["proposed", "staged", "staged_beside", "rejected"] as const;

/** Either way of saying yes: the item enters the plan when the review ends. */
export function isStagedDecision(decision: PlanProposalItemDecision): boolean {
  return decision === "staged" || decision === "staged_beside";
}

/** How a review ended. Absent while it is still open. */
export type PlanProposalDecision = "applied" | "discarded";

export type PlanProposalItemKind = "session" | "recovery_day" | "cancel";

/**
 * One decidable item.
 *
 * A session item carries what would become a plan session, plus the coach's
 * reasoning for it. A recovery-day item carries a date and nothing else,
 * because the coach authored nothing for it — the proposal offers it because
 * the coach left the date empty, and saying more would be inventing coaching.
 * A cancel item (ADR-033) names a planned session the coach suggests calling
 * off: its title as it was when the coach answered, and the coach's reason as
 * its rationale.
 */
export type PlanProposalItemView = {
  ordinal: number;
  kind: PlanProposalItemKind;
  localDate: string;
  decision: PlanProposalItemDecision;
  /** Session items, and a cancel item's session as it was. */
  title: string | null;
  sport: string | null;
  intent: string | null;
  expectedDurationMinutes: number | null;
  rationale: string | null;
  /** The item's index into the proposal content, for the parts not copied here. */
  contentIndex: number | null;
  /**
   * The planned session this one would stand in for, or a cancel item would
   * call off, which the owner left open when asking. Null for an item that
   * only adds.
   */
  replacesSessionId: string | null;
};

/**
 * Every item resolved is what makes a review finishable.
 *
 * The database enforces it too, under the lock that also writes the plan, and
 * that is the one that counts. This is here so the surface can disable the
 * control and say why rather than offering an action it knows will be refused.
 */
export function unresolvedItemCount(items: PlanProposalItemView[]): number {
  return items.filter((item) => item.decision === "proposed").length;
}

export function stagedItemCount(items: PlanProposalItemView[]): number {
  return items.filter((item) => isStagedDecision(item.decision)).length;
}

export const FIXTURE_PROVIDER_CODE = "fixture";

/** A proposal whose content was written by the built-in example coach. */
export function isExampleProposal(providerCode: string): boolean {
  return providerCode === FIXTURE_PROVIDER_CODE;
}

/**
 * The roadmap a proposal was planned under, as the review surface shows it.
 *
 * `isSuperseded` is its own fact rather than a third stale reason. The other
 * two describe a roadmap that is still the owner's; this one says the owner has
 * accepted a different roadmap since, so the surface cannot honestly describe
 * the direction the proposal was built on — it only knows which version it was.
 * That is why `title` is nullable here and nowhere else: naming the current
 * roadmap would name the wrong one.
 */
export type ProposalRoadmapView = {
  title: string | null;
  versionNumber: number;
  isSuperseded: boolean;
  staleReasons: RoadmapPlanStaleReason[];
};
