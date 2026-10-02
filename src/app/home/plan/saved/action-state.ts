/** What the library surface can ask for. */
export type LibraryOperation = "create" | "edit" | "delete" | "reuse";

export type LibraryDraft = {
  title: string;
  sport: string;
  intent: string;
  expectedDurationMinutes: string;
  note: string;
};

export type LibraryActionState = {
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
  operation?: LibraryOperation;
  savedSessionId?: string;
  draft?: LibraryDraft;
  conflict?: "stale" | "past-date" | "daily-session-limit" | "timezone";
};

export const INITIAL_LIBRARY_ACTION_STATE: LibraryActionState = {
  status: "idle",
  message: "",
  submission: 0,
};

/** The save-from-the-Plan control, which lives on the Plan surface. */
export type LibrarySaveActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  submission: number;
};

export const INITIAL_LIBRARY_SAVE_ACTION_STATE: LibrarySaveActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
