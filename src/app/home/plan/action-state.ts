/** The window the Plan surface reads and writes: owner-local today plus 13. */
export const PLAN_WINDOW_DAYS = 14;

export type PlanOperation =
  | "add"
  | "edit"
  | "move"
  | "duplicate"
  | "set_lock"
  /** Keeps the session on the record as cancelled. */
  | "cancel"
  /** Removes the session outright. Nothing is kept. */
  | "delete"
  | "set_recovery_day";

export type PlanActionDraft = {
  title: string;
  sport: string;
  intent: string;
  expectedDurationMinutes: string;
  note: string;
};

export type PlanActionState = {
  status:
    | "idle"
    | "saved"
    | "validation"
    | "conflict"
    | "rule"
    | "session"
    | "error";
  message: string;
  /** Increments once per submission so a stalled reply can be keyed to it. */
  submission: number;
  operation?: PlanOperation;
  sessionId?: string;
  localDate?: string;
  draft?: PlanActionDraft;
  conflict?:
    | "stale"
    | "past-date"
    | "daily-session-limit"
    | "session-completed"
    | "timezone";
};

export const INITIAL_PLAN_ACTION_STATE: PlanActionState = {
  status: "idle",
  message: "",
  submission: 0,
};

export type TimezoneActionState = {
  status: "idle" | "saved" | "validation" | "session" | "error";
  message: string;
  submission: number;
};

export const INITIAL_TIMEZONE_ACTION_STATE: TimezoneActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
