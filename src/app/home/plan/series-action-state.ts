export type SeriesOperation = "add_series" | "edit_series" | "end_series";

export type SeriesSkippedDate = {
  occurrenceDate: string;
  reason: "daily-session-limit" | "change-set-limit";
};

/**
 * What a list of skipped rule dates comes to on the page. Two series can skip
 * the same date, and a fill that stopped at the change-set limit can leave
 * hundreds behind (R3b-2), so the surface names each full date once and says
 * how many occurrences are still to be written rather than listing them.
 */
export function summarizeSkippedDates(skipped: SeriesSkippedDate[]): {
  fullDates: string[];
  waiting: number;
} {
  return {
    fullDates: [
      ...new Set(
        skipped
          .filter((item) => item.reason === "daily-session-limit")
          .map((item) => item.occurrenceDate),
      ),
    ].sort(),
    waiting: skipped.filter((item) => item.reason === "change-set-limit")
      .length,
  };
}

/**
 * What one series operation did to the occurrences already on the Plan. Every
 * count the receipt carries is reported, including `completedKept`: from
 * M3-15B an occurrence can hold a completion, and an owner ending a series has
 * to be told which occurrences their own logged training saved from removal.
 */
export type SeriesEffectView = {
  deleted: number;
  divergedDeleted: number;
  lockedKept: number;
  completedKept: number;
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
  conflict?: "stale" | "timezone";
};

export const INITIAL_MATERIALIZE_ACTION_STATE: MaterializeActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
