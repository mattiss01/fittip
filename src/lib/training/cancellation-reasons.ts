/**
 * Why a session was cancelled (owner, 29 Sep 2026): the six quick picks and
 * the note's bound, shared by the form that offers them and the server that
 * checks them. The labels are factual. Picking "Pain or injury" records that;
 * it does not start advice, a diagnosis, or anything else.
 */
export const CANCELLATION_REASONS = [
  "ill",
  "pain_or_injury",
  "tired",
  "no_time",
  "weather",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  ill: "Ill",
  pain_or_injury: "Pain or injury",
  tired: "Tired",
  no_time: "No time",
  weather: "Weather",
  other: "Other",
};

/** The database's bound, and the form's `maxLength`. */
export const CANCELLATION_NOTE_MAX = 500;
