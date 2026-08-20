export type SeriesOperation = "add_series" | "edit_series" | "end_series";

export type SeriesSkippedDate = {
  occurrenceDate: string;
  reason: "daily-session-limit" | "change-set-limit";
};

export type SeriesEffectView = {
  deleted: number;
  divergedDeleted: number;
  lockedKept: number;
};

export type SeriesActionState = {
  status:
    | "idle"
    | "saved"
    | "validation"
    | "conflict"
    | "rule"
    | "session"
    | "error";
  message: string;
  submission: number;
  operation?: SeriesOperation;
  sessionId?: string;
  skipped?: SeriesSkippedDate[];
  effect?: SeriesEffectView;
  conflict?: "stale" | "past-date" | "daily-session-limit" | "timezone";
};

export const INITIAL_SERIES_ACTION_STATE: SeriesActionState = {
  status: "idle",
  message: "",
  submission: 0,
};

export type MaterializeActionState = {
  status: "idle" | "saved" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  createdCount?: number;
  skipped?: SeriesSkippedDate[];
};

export const INITIAL_MATERIALIZE_ACTION_STATE: MaterializeActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
