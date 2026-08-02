export const ONBOARDING_STEPS = [
  "Goals",
  "Current training",
  "Time and access",
  "Preferences",
  "Constraints",
  "Review and save",
] as const;

export const GOAL_CATEGORIES = [
  "performance_event",
  "skill",
  "strength",
  "endurance",
  "mobility",
  "body_composition",
  "recovery_general_fitness",
  "other",
] as const;

export const LIMITATION_CATEGORIES = [
  "pain_injury",
  "illness_recovery",
  "unusual_fatigue",
  "other",
] as const;

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;
export type OnboardingDecision = "pending" | "accepted" | "rejected";
export type OnboardingResolution = "create" | "keep" | "update";
export type OnboardingCandidateKind = "goal" | "memory";
export type CandidateComparison = {
  kind: "new" | "exact" | "conflict";
  targetId: string | null;
  existingLabel: string | null;
  existingDetail: string | null;
};

export type OnboardingDraftView = {
  id: string;
  revision: number;
  currentStep: OnboardingStep;
  trainingStatus: "current" | "none" | null;
  availableDays: string[];
  sessionsPerWeek: number | null;
  sessionDurationMinutes: number | null;
  accessLabels: string[];
  timezoneName: string | null;
  units: "metric" | "imperial" | null;
  idempotencyKey: string;
  expiresAt: string;
};

export type TrainingActivityDraft = {
  id: string;
  position: number;
  name: string;
  sessionsPerWeek: number;
  durationMinutes: number;
  detail: string | null;
};

export type GoalCandidateView = {
  id: string;
  position: number;
  title: string;
  desiredOutcome: string;
  category: (typeof GOAL_CATEGORIES)[number];
  activityAreas: string[];
  startDate: string;
  targetDate?: string;
  targetDetail?: string;
  targetMetricLabel?: string;
  targetMetricValue?: string;
  targetMetricUnit?: string;
  priorityTier: "core" | "supporting";
  targetRank?: number;
  rationale?: string;
  constraints?: string;
  decision: OnboardingDecision;
  resolution: OnboardingResolution | null;
  targetGoalId: string | null;
  comparison: CandidateComparison;
};

export type MemoryCandidateView = {
  id: string;
  position: number;
  fieldKey: string;
  memoryType: string;
  content: string;
  decision: OnboardingDecision;
  resolution: OnboardingResolution | null;
  targetMemoryId: string | null;
  comparison: CandidateComparison;
};

export type OnboardingSnapshot = {
  draft: OnboardingDraftView | null;
  activities: TrainingActivityDraft[];
  goalCandidates: GoalCandidateView[];
  memoryCandidates: MemoryCandidateView[];
  goalRevision: number;
  memoryRevision: number;
  activeGoalOrder: Array<{
    id: string;
    title: string;
    priorityTier: "core" | "supporting";
    activeRank: number;
  }>;
  promptDismissed: boolean;
  hasPublished: boolean;
};
