/**
 * What a plan-proposal Server Action returns, and what the surface renders from
 * it.
 *
 * It lives apart from `actions.ts` because a `use server` module may export
 * nothing but async functions, and the client components need the type and the
 * initial value. Nothing here imports `@/server/**`, so a Client Component may
 * import it.
 */

export type PlanProposalActionStatus =
  /** Nothing has been submitted yet. */
  | "idle"
  /** A proposal was generated and is waiting below. */
  | "proposal"
  /** An attempt under this key is already running; no second call was made. */
  | "pending"
  /** One item's choice was recorded. */
  | "decided"
  /** The review finished and the staged items entered the plan. */
  | "applied"
  /** The review finished with no plan write. */
  | "discarded"
  /** An item is still undecided, so the finish was refused. */
  | "unresolved"
  /** The owner's input is wrong and nothing was written. */
  | "validation"
  /** Something changed underneath; the owner must look again. */
  | "conflict"
  /** A plan rule refused the change set. Nothing was added. */
  | "rule"
  /** The session ended. */
  | "session"
  | "error";

export type PlanProposalActionDraft = {
  dayCount: string;
  planningNote: string;
};

export type PlanProposalActionState = {
  status: PlanProposalActionStatus;
  message: string;
  /**
   * Increments once per submission, so a reply can be told apart from the one
   * before it even when both carry the same status and message.
   */
  submission: number;
  /**
   * Returned on a rejected compose so the form keeps what was typed.
   *
   * A form action resets an uncontrolled form when its reply commits, so the
   * two fields are re-seeded from this rather than left blank under a refusal
   * the owner has to act on.
   */
  draft?: PlanProposalActionDraft;
};

export const INITIAL_PLAN_PROPOSAL_ACTION_STATE: PlanProposalActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
