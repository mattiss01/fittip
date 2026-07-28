import type { Json } from "@/lib/supabase/database.types";

export const COMPLETION_STATUSES = [
  "completed",
  "partially_completed",
  "skipped",
  "replaced",
  "rest",
  "unplanned",
] as const;

export const COMPLETION_FEELINGS = [
  "much_easier",
  "easier",
  "as_expected",
  "harder",
  "much_harder",
] as const;

export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];
export type CompletionFeeling = (typeof COMPLETION_FEELINGS)[number];

export type CompletionActivityInput = {
  plannedActivityId?: string;
  personalActivityId?: string;
  position: number;
  name: string;
  sport: string;
  instructions?: string;
  measurementMode:
    | "sets_reps_load"
    | "time_distance_pace"
    | "duration_intensity"
    | "skill_repetitions"
    | "custom";
  actualMeasurement?: Json;
};

export type CompletionInput = {
  idempotencyKey: string;
  completionGroupId?: string;
  expectedRevision: number;
  plannedSessionId?: string;
  actualLocalDate: string;
  actualStartedAt?: string;
  timezoneName: string;
  durationMinutes?: number;
  status: CompletionStatus;
  perceivedEffort?: number;
  feeling?: CompletionFeeling;
  note?: string;
  replacementDescription?: string;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
  correctionReason?: string;
  activities: CompletionActivityInput[];
};

export type CompletedActivity = CompletionActivityInput & {
  id: string;
  completedSessionId: string;
};

export type CompletionRevision = Omit<
  CompletionInput,
  "idempotencyKey" | "expectedRevision" | "activities"
> & {
  id: string;
  userId: string;
  completionGroupId: string;
  revisionNumber: number;
  previousCompletionId: string | null;
  createdAt: string;
  activities: CompletedActivity[];
};

export type CompletionHistory = {
  current: CompletionRevision;
  revisions: CompletionRevision[];
};

export type PlannedSessionSnapshot = {
  id: string;
  localDate: string;
  title: string;
  sport: string;
  intent: string | null;
  expectedDurationMinutes: number | null;
  activities: Array<{
    id: string;
    name: string;
    sport: string;
    instructions: string | null;
    measurementMode: CompletionActivityInput["measurementMode"];
  }>;
};
