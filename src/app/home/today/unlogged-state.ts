/** A past session on the reminder, as Today lists it. */
export type UnloggedSessionView = {
  id: string;
  localDate: string;
  position: number;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  startTime: string | null;
};

/**
 * One row's "Didn't do it": saved as a Skipped log, or refused with the
 * reason. `submission` counts answers, so the same message twice still reads
 * as a new answer.
 */
export type SkipSessionState = {
  status: "idle" | "saved" | "error";
  message: string;
  submission: number;
  completionId?: string;
};

export const INITIAL_SKIP_STATE: SkipSessionState = {
  status: "idle",
  message: "",
  submission: 0,
};
