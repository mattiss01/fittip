/**
 * How far ahead recurring sessions are written, and a series may start:
 * owner-local today plus 90, thirteen weeks in all (R3b-2; it was fourteen
 * days). The same number `materialize_rolling_plan_series` writes through. A
 * single session reaches further; see `PLAN_PLACEMENT_DAYS`.
 */
export const PLAN_WINDOW_DAYS = 91;

/**
 * How far ahead a single session may be placed: owner-local today plus 180
 * (R3b-3, owner, 2 Oct 2026 - a race months away is a session, not only a
 * goal). Recurring sessions stop at `PLAN_WINDOW_DAYS`. 180 days is how far
 * ahead the coach reads single sessions (ADR-013 decision 5, as amended on
 * 9 Oct 2026), so a race placed at the far end reaches it, within the coach's
 * own limit on how many entries it is sent. No database function limits this;
 * the bound is this one.
 */
export const PLAN_PLACEMENT_DAYS = 181;

/**
 * How many whole weeks before this one the Plan shows (owner, 2 Oct 2026: a
 * full quarter, the span recurring sessions are written ahead). They are
 * read-only, as every day before today is. The Plan reads every week it can
 * show in one slice, so this is also what a longer history would cost.
 */
export const PLAN_HISTORY_WEEKS = 13;

export type PlanOperation =
  | "add"
  | "edit"
  | "move"
  | "duplicate"
  /** Keeps the session on the record as cancelled. */
  | "cancel"
  /** Removes the session outright. Nothing is kept. */
  | "delete"
  /** Returns a cancelled session to the plan, after the day's last one. */
  | "reactivate"
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
