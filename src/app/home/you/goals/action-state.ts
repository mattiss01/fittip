export type GoalActionDraft = {
  title: string;
  desiredOutcome: string;
  sports: string;
  targetDate: string;
  priorityTier: string;
};

export type GoalActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  operation?: string;
  goalId?: string;
  draft?: GoalActionDraft;
  conflict?: "stale" | "core-limit";
};

export const INITIAL_GOAL_ACTION_STATE: GoalActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
