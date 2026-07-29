export const MEASUREMENT_MODES = [
  "duration_intensity",
  "time_distance_pace",
  "skill_repetitions",
  "sets_reps_load",
  "custom",
] as const;

export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];

export type MeasurementTarget = Record<
  string,
  string | number | boolean | undefined
>;

export type PlanActivityDraft = {
  clientId: string;
  personalActivityId?: string;
  name: string;
  sport: string;
  instructions: string;
  measurementMode: MeasurementMode;
  target?: MeasurementTarget;
  isLocked: boolean;
};

export type PlanSessionDraft = {
  clientId: string;
  localDate: string;
  title: string;
  sport: string;
  intent: string;
  expectedDurationMinutes?: number;
  note: string;
  isLocked: boolean;
  activities: PlanActivityDraft[];
};

export type PlanDraft = {
  dayCount: number;
  startDate: string;
  timezoneName: string;
  sessions: PlanSessionDraft[];
};

export type PersonalActivityOption = {
  id: string;
  name: string;
  sport: string;
  description: string | null;
  measurementMode: MeasurementMode;
  defaultMeasurement?: MeasurementTarget;
};

export type PlanningInitialState = {
  plan: PlanDraft | null;
  expectedRevision: number;
  versionNumber: number | null;
  personalActivities: PersonalActivityOption[];
};

export type PlanningActionResult =
  | {
      status: "saved";
      revision: number;
      versionNumber: number;
      acceptedAt: string;
    }
  | {
      status:
        | "validation-error"
        | "conflict"
        | "session-expired"
        | "save-error";
      message: string;
    };

export type PersonalActivityActionResult =
  | {
      status: "saved";
      activity: PersonalActivityOption;
    }
  | {
      status: "validation-error" | "session-expired" | "save-error";
      message: string;
    };

export type ArchiveActivityActionResult =
  | { status: "archived"; id: string }
  | {
      status: "validation-error" | "session-expired" | "save-error";
      message: string;
    };
