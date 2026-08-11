/**
 * What a roadmap action tells its screen.
 *
 * Every failure state is one the interface renders differently, and none of
 * them ever claims that something was saved when it was not. `draft` returns
 * the owner's own words to their own screen so a rejected submission does not
 * lose them; it is never logged and never leaves the response.
 */
export type RoadmapActionStatus =
  | "idle"
  | "proposal"
  | "accepted"
  | "declined"
  | "edited"
  | "pending"
  | "validation"
  | "conflict"
  | "cap-reached"
  | "session"
  | "error";

export type RoadmapActionDraft = {
  endDate: string;
  planningNote: string;
  regenerationFeedback: string;
};

export type RoadmapActionState = {
  status: RoadmapActionStatus;
  message: string;
  /** Increments on every response, so a repeated identical result still renders. */
  submission: number;
  proposalId?: string;
  memoryCandidateCount?: number;
  draft?: RoadmapActionDraft;
};

export const INITIAL_ROADMAP_ACTION_STATE: RoadmapActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
