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

/** What the owner has said about one proposed item. */
export type PlanProposalItemDecision = "proposed" | "staged" | "rejected";

export const PLAN_PROPOSAL_ITEM_DECISIONS: readonly PlanProposalItemDecision[] =
  ["proposed", "staged", "rejected"] as const;

/** How a review ended. Absent while it is still open. */
export type PlanProposalDecision = "applied" | "discarded";

export type PlanProposalItemKind = "session" | "recovery_day";

/**
 * One decidable item.
 *
 * A session item carries what would become a plan session, plus the coach's
 * reasoning for it. A recovery-day item carries a date and nothing else,
 * because the coach authored nothing for it — the proposal offers it because
 * the coach left the date empty, and saying more would be inventing coaching.
 */
export type PlanProposalItemView = {
  ordinal: number;
  kind: PlanProposalItemKind;
  localDate: string;
  decision: PlanProposalItemDecision;
  /** Session items only. */
  title: string | null;
  sport: string | null;
  intent: string | null;
  expectedDurationMinutes: number | null;
  rationale: string | null;
  /** The item's index into the proposal content, for the parts not copied here. */
  contentIndex: number | null;
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
  return items.filter((item) => item.decision === "staged").length;
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
