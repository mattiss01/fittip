export type PlanProposalActionStatus =
  | "idle"
  | "proposal"
  | "rejected"
  | "safety-hold"
  | "pending"
  | "validation"
  | "conflict"
  | "session"
  | "error";

export type PlanProposalActionState = {
  status: PlanProposalActionStatus;
  message: string;
  submission: number;
  proposalId?: string;
  memoryCandidateCount?: number;
  draft?: { dayCount: string; startDate: string; planningNote: string };
};

export const INITIAL_PLAN_PROPOSAL_ACTION_STATE: PlanProposalActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
