export type GoalSuggestionActionState = {
  status: "idle" | "saved" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  suggestionId?: string;
};

export const INITIAL_GOAL_SUGGESTION_ACTION_STATE: GoalSuggestionActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
