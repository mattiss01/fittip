export type GoalActionDraft = {
  title: string;
  desiredOutcome: string;
  category: string;
  activityAreas: string;
  startDate: string;
  targetDate: string;
  targetDetail: string;
  targetMetricLabel: string;
  targetMetricValue: string;
  targetMetricUnit: string;
  priorityTier: string;
  rationale: string;
  constraints: string;
};

export type GoalActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  operation?: string;
  goalId?: string;
  draft?: GoalActionDraft;
};

export const INITIAL_GOAL_ACTION_STATE: GoalActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
